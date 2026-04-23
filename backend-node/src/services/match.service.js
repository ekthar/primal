const { query, transaction } = require('../db');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');
const divisionService = require('./division.service');

const DIVISION_MATCH_STATUSES = new Set(['pending', 'ready', 'walkover', 'completed']);
const BRACKET_STATUS_LABELS = {
  draft: 'Draft',
  live: 'Live',
  completed: 'Completed',
};

function assertAdmin(actor) {
  if (!actor || actor.role !== 'admin') throw ApiError.forbidden();
}

function titleCase(value) {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function nextPowerOfTwo(n) {
  let power = 1;
  while (power < n) power *= 2;
  return power;
}

function createSeedOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const nextSize = seeds.length * 2 + 1;
    const nextSeeds = [];
    seeds.forEach((seed) => {
      nextSeeds.push(seed, nextSize - seed);
    });
    seeds = nextSeeds;
  }
  return seeds;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getRoundLabel(roundIndex, totalRounds) {
  const remaining = totalRounds - roundIndex;
  if (remaining === 0) return 'Final';
  if (remaining === 1) return 'Semifinal';
  if (remaining === 2) return 'Quarterfinal';
  return `Round ${roundIndex + 1}`;
}

function buildFixtureSchedule(bracket) {
  if (!bracket?.rounds?.length) return [];
  const sessions = ['Morning Card', 'Prime Card', 'Final Block'];
  const arenas = ['Cage A', 'Cage B'];
  let boutNumber = 1;

  return bracket.rounds.flatMap((round, roundIndex) =>
    round.matches
      .filter((match) => !match.sides.every((side) => side.isBye))
      .map((match, matchIndex) => ({
        id: `${match.id}-fixture`,
        boutNumber: boutNumber++,
        label: match.label,
        roundLabel: round.label,
        session: sessions[Math.min(roundIndex, sessions.length - 1)],
        arena: arenas[(roundIndex + matchIndex) % arenas.length],
        scheduledAt: null,
        categoryLabel: bracket.categoryLabel,
        red: match.sides[0],
        blue: match.sides[1],
        status: match.status,
      }))
  );
}

function summarizeConflicts(matches) {
  const penalties = [];
  let score = 0;
  let sameClubCollisions = 0;

  matches
    .filter((match) => match.roundNumber === 1 && match.conflict?.reason === 'same_club')
    .forEach((match) => {
      sameClubCollisions += 1;
      score += Number(match.conflict.points || 100);
      penalties.push({
        code: 'same_club',
        severity: 'critical',
        points: Number(match.conflict.points || 100),
        message: match.conflict.message,
      });
    });

  const byes = matches.filter((match) => match.status === 'walkover').length;
  return {
    score,
    penalties,
    summary: {
      sameClubCollisions,
      largeSeedGaps: 0,
      byes,
    },
  };
}

function mapEntrySide(entry, corner) {
  if (!entry) {
    return {
      name: 'Bye',
      club: null,
      nationality: null,
      seedScore: null,
      participantId: null,
      applicationId: null,
      entryId: null,
      isBye: true,
      corner,
    };
  }

  return {
    name: entry.participantName || 'TBD',
    club: entry.clubName || null,
    nationality: entry.nationality || null,
    seedScore: entry.displaySeed || entry.seed || entry.derivedSeedScore || null,
    participantId: entry.profileId || null,
    applicationId: entry.applicationId || null,
    entryId: entry.id,
    isBye: false,
    corner,
  };
}

function buildBracketStatus(matches, champion) {
  if (champion) return 'completed';
  if (!matches.length) return 'draft';
  if (matches.some((match) => match.winnerEntryId || match.status === 'completed' || match.status === 'walkover')) return 'live';
  return 'draft';
}

function evaluateRoundOneConflict(slots) {
  let score = 0;
  let sameClubCollisions = 0;

  for (let index = 0; index < slots.length; index += 2) {
    const left = slots[index];
    const right = slots[index + 1];
    if (!left || !right) continue;
    if (left.clubId && right.clubId && left.clubId === right.clubId) {
      sameClubCollisions += 1;
      score += 100;
    }
  }

  return { score, sameClubCollisions };
}

function chooseSlotLayout(entries, bracketSize) {
  const seedOrder = createSeedOrder(bracketSize);
  const seedPositions = new Map(seedOrder.map((seed, index) => [seed, index]));
  const manualSeeded = entries
    .filter((entry) => Number.isInteger(entry.seed) && entry.seed > 0 && entry.seed <= bracketSize)
    .sort((a, b) => a.seed - b.seed);
  const unseeded = entries
    .filter((entry) => !(Number.isInteger(entry.seed) && entry.seed > 0 && entry.seed <= bracketSize))
    .sort((a, b) => Number(b.derivedSeedScore || 0) - Number(a.derivedSeedScore || 0));

  const manualIds = new Set(manualSeeded.map((entry) => entry.id));
  const ranked = [
    ...manualSeeded,
    ...unseeded.filter((entry) => !manualIds.has(entry.id)),
  ];

  let bestSlots = null;
  let bestEval = { score: Number.POSITIVE_INFINITY, sameClubCollisions: Number.POSITIVE_INFINITY };

  const attempts = manualSeeded.length ? 80 : 160;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const shuffled = manualSeeded.length ? ranked : shuffle(ranked);
    const slots = Array(bracketSize).fill(null);

    manualSeeded.forEach((entry) => {
      slots[seedPositions.get(entry.seed)] = entry;
    });

    let seedCursor = 1;
    shuffled.forEach((entry) => {
      if (slots.includes(entry)) return;
      while (seedCursor <= bracketSize && slots[seedPositions.get(seedCursor)]) seedCursor += 1;
      if (seedCursor <= bracketSize) {
        slots[seedPositions.get(seedCursor)] = entry;
        seedCursor += 1;
      }
    });

    const evaluation = evaluateRoundOneConflict(slots);
    if (evaluation.score < bestEval.score) {
      bestSlots = slots;
      bestEval = evaluation;
    }
    if (bestEval.score === 0) break;
  }

  return {
    slots: bestSlots || Array(bracketSize).fill(null),
    diagnostics: bestEval,
  };
}

async function listActiveEntriesForDivision(divisionId) {
  const { rows } = await query(
    `
      SELECT
        de.id,
        de.division_id,
        de.application_id,
        de.profile_id,
        de.participant_name,
        de.club_id,
        de.club_name,
        de.seed,
        de.derived_seed_score,
        de.metadata,
        p.nationality,
        p.gender
      FROM division_entries de
      LEFT JOIN profiles p ON p.id = de.profile_id
      WHERE de.division_id = $1
        AND de.deleted_at IS NULL
        AND de.status = 'approved'
      ORDER BY COALESCE(de.seed, 99999) ASC, de.derived_seed_score DESC, de.participant_name ASC
    `,
    [divisionId]
  );

  return rows.map((row, index) => ({
    id: row.id,
    divisionId: row.division_id,
    applicationId: row.application_id,
    profileId: row.profile_id,
    participantName: row.participant_name,
    clubId: row.club_id,
    clubName: row.club_name,
    seed: row.seed === null ? null : Number(row.seed),
    derivedSeedScore: Number(row.derived_seed_score || 0),
    displaySeed: row.seed === null ? index + 1 : Number(row.seed),
    nationality: row.nationality || null,
    gender: row.gender || null,
    metadata: row.metadata || {},
  }));
}

async function listMatchesForDivision(divisionId) {
  const { rows } = await query(
    `
      SELECT
        m.*,
        e1.participant_name AS entry1_name,
        e1.club_name AS entry1_club_name,
        e1.application_id AS entry1_application_id,
        e1.profile_id AS entry1_profile_id,
        e1.seed AS entry1_seed,
        e1.derived_seed_score AS entry1_derived_seed_score,
        p1.nationality AS entry1_nationality,
        e2.participant_name AS entry2_name,
        e2.club_name AS entry2_club_name,
        e2.application_id AS entry2_application_id,
        e2.profile_id AS entry2_profile_id,
        e2.seed AS entry2_seed,
        e2.derived_seed_score AS entry2_derived_seed_score,
        p2.nationality AS entry2_nationality,
        we.participant_name AS winner_name,
        we.club_name AS winner_club_name,
        we.application_id AS winner_application_id,
        we.profile_id AS winner_profile_id,
        we.seed AS winner_seed,
        we.derived_seed_score AS winner_derived_seed_score,
        wp.nationality AS winner_nationality
      FROM matches m
      LEFT JOIN division_entries e1 ON e1.id = m.entry1_id
      LEFT JOIN profiles p1 ON p1.id = e1.profile_id
      LEFT JOIN division_entries e2 ON e2.id = m.entry2_id
      LEFT JOIN profiles p2 ON p2.id = e2.profile_id
      LEFT JOIN division_entries we ON we.id = m.winner_entry_id
      LEFT JOIN profiles wp ON wp.id = we.profile_id
      WHERE m.division_id = $1
        AND m.deleted_at IS NULL
      ORDER BY m.round_number ASC, m.match_number ASC
    `,
    [divisionId]
  );

  return rows.map((row) => ({
    id: row.id,
    divisionId: row.division_id,
    roundNumber: Number(row.round_number),
    matchNumber: Number(row.match_number),
    entry1Id: row.entry1_id,
    entry2Id: row.entry2_id,
    winnerEntryId: row.winner_entry_id,
    nextMatchId: row.next_match_id,
    nextMatchSlot: row.next_match_slot === null ? null : Number(row.next_match_slot),
    status: row.status,
    conflict: row.conflict || null,
    entry1: row.entry1_id
      ? {
          id: row.entry1_id,
          participantName: row.entry1_name,
          clubName: row.entry1_club_name,
          applicationId: row.entry1_application_id,
          profileId: row.entry1_profile_id,
          seed: row.entry1_seed === null ? null : Number(row.entry1_seed),
          derivedSeedScore: Number(row.entry1_derived_seed_score || 0),
          displaySeed: row.entry1_seed === null ? Number(row.entry1_derived_seed_score || 0) : Number(row.entry1_seed),
          nationality: row.entry1_nationality || null,
        }
      : null,
    entry2: row.entry2_id
      ? {
          id: row.entry2_id,
          participantName: row.entry2_name,
          clubName: row.entry2_club_name,
          applicationId: row.entry2_application_id,
          profileId: row.entry2_profile_id,
          seed: row.entry2_seed === null ? null : Number(row.entry2_seed),
          derivedSeedScore: Number(row.entry2_derived_seed_score || 0),
          displaySeed: row.entry2_seed === null ? Number(row.entry2_derived_seed_score || 0) : Number(row.entry2_seed),
          nationality: row.entry2_nationality || null,
        }
      : null,
    winner: row.winner_entry_id
      ? {
          id: row.winner_entry_id,
          participantName: row.winner_name,
          clubName: row.winner_club_name,
          applicationId: row.winner_application_id,
          profileId: row.winner_profile_id,
          seed: row.winner_seed === null ? null : Number(row.winner_seed),
          derivedSeedScore: Number(row.winner_derived_seed_score || 0),
          displaySeed: row.winner_seed === null ? Number(row.winner_derived_seed_score || 0) : Number(row.winner_seed),
          nationality: row.winner_nationality || null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function createInitialMatchBlueprints(entries) {
  const fighterCount = entries.length;
  if (!fighterCount) return { bracketSize: 0, rounds: [], diagnostics: { score: 0, sameClubCollisions: 0 } };
  if (fighterCount === 1) return { bracketSize: 1, rounds: [], diagnostics: { score: 0, sameClubCollisions: 0 } };

  const bracketSize = nextPowerOfTwo(fighterCount);
  const { slots, diagnostics } = chooseSlotLayout(entries, bracketSize);
  const totalRounds = Math.log2(bracketSize);
  const rounds = [];
  let matchesInRound = bracketSize / 2;

  for (let round = 1; round <= totalRounds; round += 1) {
    const currentRound = [];
    for (let matchNumber = 1; matchNumber <= matchesInRound; matchNumber += 1) {
      currentRound.push({
        roundNumber: round,
        matchNumber,
        entry1Id: null,
        entry2Id: null,
        winnerEntryId: null,
        nextMatchRound: round < totalRounds ? round + 1 : null,
        nextMatchNumber: round < totalRounds ? Math.floor((matchNumber - 1) / 2) + 1 : null,
        nextMatchSlot: round < totalRounds ? ((matchNumber - 1) % 2) + 1 : null,
        status: 'pending',
        conflict: null,
      });
    }
    rounds.push(currentRound);
    matchesInRound /= 2;
  }

  for (let index = 0; index < slots.length; index += 2) {
    const match = rounds[0][index / 2];
    const left = slots[index];
    const right = slots[index + 1];
    match.entry1Id = left?.id || null;
    match.entry2Id = right?.id || null;
    if (left && right && left.clubId && right.clubId && left.clubId === right.clubId) {
      match.conflict = {
        reason: 'same_club',
        message: `${left.participantName} and ${right.participantName} are from ${left.clubName || 'the same club'} in round 1.`,
        points: 100,
      };
    }
  }

  return { bracketSize, rounds, diagnostics };
}

async function createMatchesForDivision(client, divisionId, entries) {
  const { bracketSize, rounds, diagnostics } = createInitialMatchBlueprints(entries);
  if (bracketSize <= 1) {
    await client.query(`UPDATE divisions SET generated_at = NOW(), updated_at = NOW() WHERE id = $1`, [divisionId]);
    return { bracketSize, diagnostics };
  }

  const inserted = [];
  for (const round of rounds) {
    for (const match of round) {
      const { rows } = await client.query(
        `
          INSERT INTO matches (
            division_id,
            round_number,
            match_number,
            entry1_id,
            entry2_id,
            winner_entry_id,
            next_match_slot,
            status,
            conflict
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING id
        `,
        [
          divisionId,
          match.roundNumber,
          match.matchNumber,
          match.entry1Id,
          match.entry2Id,
          match.winnerEntryId,
          match.nextMatchSlot,
          match.status,
          match.conflict ? JSON.stringify(match.conflict) : null,
        ]
      );

      inserted.push({
        ...match,
        id: rows[0].id,
      });
    }
  }

  const matchIdMap = new Map(inserted.map((match) => [`${match.roundNumber}:${match.matchNumber}`, match.id]));
  for (const match of inserted) {
    if (!match.nextMatchRound) continue;
    await client.query(
      `UPDATE matches SET next_match_id = $2, updated_at = NOW() WHERE id = $1`,
      [match.id, matchIdMap.get(`${match.nextMatchRound}:${match.nextMatchNumber}`)]
    );
  }

  const stateById = new Map(inserted.map((match) => [
    match.id,
    {
      ...match,
      nextMatchId: match.nextMatchRound ? matchIdMap.get(`${match.nextMatchRound}:${match.nextMatchNumber}`) : null,
    },
  ]));

  let changed = true;
  while (changed) {
    changed = false;
    const ordered = [...stateById.values()].sort((a, b) => (a.roundNumber - b.roundNumber) || (a.matchNumber - b.matchNumber));
    for (const match of ordered) {
      const entryCount = [match.entry1Id, match.entry2Id].filter(Boolean).length;
      if (!match.winnerEntryId && entryCount === 1) {
        match.winnerEntryId = match.entry1Id || match.entry2Id;
        match.status = 'walkover';
        await client.query(
          `UPDATE matches SET winner_entry_id = $2, status = 'walkover', updated_at = NOW() WHERE id = $1`,
          [match.id, match.winnerEntryId]
        );
        changed = true;
      } else if (!match.winnerEntryId && entryCount === 2 && match.status !== 'ready') {
        match.status = 'ready';
        await client.query(`UPDATE matches SET status = 'ready', updated_at = NOW() WHERE id = $1`, [match.id]);
        changed = true;
      }

      if (match.winnerEntryId && match.nextMatchId) {
        const next = stateById.get(match.nextMatchId);
        if (!next) continue;
        const targetField = match.nextMatchSlot === 1 ? 'entry1_id' : 'entry2_id';
        const localField = match.nextMatchSlot === 1 ? 'entry1Id' : 'entry2Id';
        if (!next[localField]) {
          next[localField] = match.winnerEntryId;
          await client.query(
            `UPDATE matches SET ${targetField} = $2, updated_at = NOW() WHERE id = $1`,
            [next.id, match.winnerEntryId]
          );
          changed = true;
        }
      }
    }
  }

  await client.query(`UPDATE divisions SET generated_at = NOW(), updated_at = NOW() WHERE id = $1`, [divisionId]);
  return { bracketSize, diagnostics };
}

function validateRegeneration(matches) {
  const progressed = matches.some((match) => match.status === 'completed');
  if (progressed) {
    throw ApiError.unprocessable('Bracket regeneration is blocked once results exist. Reset the division before regenerating.');
  }
}

async function generateDivisionBracket(actor, divisionId, { force = false } = {}, ctx = {}) {
  assertAdmin(actor);
  const division = await divisionService.getDivision(actor, divisionId);
  if (!division) throw ApiError.notFound('Division not found');

  const entries = await listActiveEntriesForDivision(divisionId);
  if (!entries.length) throw ApiError.unprocessable('Division has no approved entries to generate');

  const existingMatches = await listMatchesForDivision(divisionId);
  if (existingMatches.length) {
    validateRegeneration(existingMatches);
  }

  await transaction(async (client) => {
    await client.query(`DELETE FROM matches WHERE division_id = $1`, [divisionId]);
    await createMatchesForDivision(client, divisionId, entries);
  });

  const payload = await getDivisionBracket(actor, divisionId);
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'division.generate_bracket',
    entityType: 'division',
    entityId: divisionId,
    payload: { force, fighterCount: entries.length },
    requestIp: ctx.ip,
  });
  return payload;
}

async function syncTournamentDivisions(actor, tournamentId, ctx = {}) {
  assertAdmin(actor);
  return divisionService.syncTournament(actor, tournamentId, ctx);
}

async function listTournamentDivisions(actor, tournamentId) {
  assertAdmin(actor);
  return divisionService.listForTournament(actor, tournamentId);
}

function deriveChampion(entries, matches) {
  if (!entries.length) return null;
  if (!matches.length && entries.length === 1) return entries[0];

  const finalRound = matches.reduce((max, match) => Math.max(max, match.roundNumber), 0);
  const finalMatch = matches.find((match) => match.roundNumber === finalRound && match.matchNumber === 1);
  return finalMatch?.winner || null;
}

function transformDivisionBracket(division, entries, matches) {
  const roundsMap = new Map();
  const champion = deriveChampion(entries, matches);
  const bracketSize = matches.length ? 2 ** Math.max(...matches.map((match) => match.roundNumber)) : entries.length;
  const diagnostics = summarizeConflicts(matches);

  matches.forEach((match) => {
    if (!roundsMap.has(match.roundNumber)) {
      roundsMap.set(match.roundNumber, {
        id: `round-${match.roundNumber}`,
        label: getRoundLabel(match.roundNumber - 1, Math.max(...matches.map((item) => item.roundNumber))),
        matches: [],
      });
    }

    const round = roundsMap.get(match.roundNumber);
    const sides = [mapEntrySide(match.entry1, 'red'), mapEntrySide(match.entry2, 'blue')];
    const winnerIndex = match.winnerEntryId
      ? sides.findIndex((side) => side.entryId === match.winnerEntryId)
      : undefined;

    round.matches.push({
      id: match.id,
      round: match.roundNumber,
      label: match.roundNumber === 1 ? `Bout ${match.matchNumber}` : `Match ${match.matchNumber}`,
      matchNumber: match.matchNumber,
      status: match.status,
      sides,
      conflict: match.conflict || null,
      ...(winnerIndex >= 0 ? { winnerIndex } : {}),
    });
  });

  const rounds = Array.from(roundsMap.values()).sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
  const status = buildBracketStatus(matches, champion);

  const bracket = {
    id: division.id,
    divisionId: division.id,
    categoryId: division.id,
    categoryLabel: division.label,
    rulesetLabel: division.disciplineLabel,
    bracketSize,
    entryCount: entries.length,
    seeding: 'hybrid',
    seedingLabel: 'Hybrid seed',
    status,
    statusLabel: BRACKET_STATUS_LABELS[status] || titleCase(status),
    rounds,
    generation: diagnostics,
    policy: {
      sameClub: 'avoid_if_possible',
      sameCategoryOnly: true,
      fixtureType: entries.length <= 1 ? 'auto champion' : 'single elimination',
    },
  };

  return {
    division,
    entries,
    champion,
    bracket: {
      ...bracket,
      fixtures: buildFixtureSchedule(bracket),
    },
  };
}

async function getDivisionBracket(actor, divisionId) {
  assertAdmin(actor);
  const division = await divisionService.getDivision(actor, divisionId);
  if (!division) throw ApiError.notFound('Division not found');

  const [entries, matches] = await Promise.all([
    listActiveEntriesForDivision(divisionId),
    listMatchesForDivision(divisionId),
  ]);

  return transformDivisionBracket(division, entries, matches);
}

async function submitMatchResult(actor, matchId, { winnerEntryId }, ctx = {}) {
  assertAdmin(actor);
  if (!winnerEntryId) throw ApiError.unprocessable('Winner entry is required', { field: 'winnerEntryId' });

  let divisionId = null;
  await transaction(async (client) => {
    const { rows } = await client.query(
      `
        SELECT *
        FROM matches
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [matchId]
    );

    const match = rows[0];
    if (!match) throw ApiError.notFound('Match not found');
    divisionId = match.division_id;

    const validWinners = [match.entry1_id, match.entry2_id].filter(Boolean);
    if (!validWinners.includes(winnerEntryId)) {
      throw ApiError.unprocessable('Winner must be one of the current match entries', { field: 'winnerEntryId' });
    }

    await client.query(
      `
        UPDATE matches
        SET winner_entry_id = $2,
            status = 'completed',
            updated_at = NOW()
        WHERE id = $1
      `,
      [matchId, winnerEntryId]
    );

    if (match.next_match_id && match.next_match_slot) {
      const targetField = Number(match.next_match_slot) === 1 ? 'entry1_id' : 'entry2_id';
      await client.query(
        `UPDATE matches SET ${targetField} = $2, updated_at = NOW() WHERE id = $1`,
        [match.next_match_id, winnerEntryId]
      );

      const { rows: nextRows } = await client.query(
        `SELECT entry1_id, entry2_id FROM matches WHERE id = $1 LIMIT 1`,
        [match.next_match_id]
      );
      const nextMatch = nextRows[0];
      if (nextMatch) {
        const nextStatus = nextMatch.entry1_id && nextMatch.entry2_id ? 'ready' : 'pending';
        await client.query(
          `UPDATE matches SET status = $2, updated_at = NOW() WHERE id = $1 AND status <> 'completed'`,
          [match.next_match_id, nextStatus]
        );
      }
    }
  });

  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'match.result',
    entityType: 'match',
    entityId: matchId,
    payload: { winnerEntryId },
    requestIp: ctx.ip,
  });

  return getDivisionBracket(actor, divisionId);
}

async function setManualSeeds(actor, divisionId, payload, ctx = {}) {
  assertAdmin(actor);
  const seeds = Array.isArray(payload?.seeds) ? payload.seeds : [];
  const result = await divisionService.setManualSeeds(actor, divisionId, seeds, ctx);
  return result;
}

async function getDivisionBracketExport(actor, divisionId) {
  assertAdmin(actor);
  return getDivisionBracket(actor, divisionId);
}

module.exports = {
  DIVISION_MATCH_STATUSES,
  syncTournamentDivisions,
  listTournamentDivisions,
  generateDivisionBracket,
  getDivisionBracket,
  getDivisionBracketExport,
  submitMatchResult,
  setManualSeeds,
  listActiveEntriesForDivision,
  listMatchesForDivision,
};

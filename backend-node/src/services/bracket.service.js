const { query } = require('../db');
const { tournaments: tournamentsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');
const divisionService = require('./division.service');

const GENERATION_PRESETS = [
  {
    id: 'fair_draw',
    label: 'Fair Draw',
    shortLabel: 'Fair',
    description: 'Avoid same-club round-one collisions first, then keep seed spread reasonable.',
  },
  {
    id: 'seeded_championship',
    label: 'Seeded Championship',
    shortLabel: 'Seeded',
    description: 'Protect top seeds and still try to prevent same-club first-round fights.',
  },
  {
    id: 'open_draw',
    label: 'Open Draw',
    shortLabel: 'Open',
    description: 'Looser bracket style with light conflict control when a faster draw is acceptable.',
  },
];

const BRACKET_STATUSES = new Set(['draft', 'locked', 'live', 'completed']);
const PRESERVED_STATUSES = new Set(['locked', 'live', 'completed']);
const AGE_GROUPS = [
  { id: 'cadet', label: 'Cadet', min: 12, max: 15 },
  { id: 'junior', label: 'Junior', min: 16, max: 17 },
  { id: 'adult', label: 'Adult', min: 18, max: 34 },
  { id: 'master', label: 'Master', min: 35, max: 45 },
  { id: 'veteran', label: 'Veteran', min: 46, max: 120 },
];

function titleCase(value) {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeGender(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('f')) return { id: 'female', label: 'Female' };
  if (raw.startsWith('m')) return { id: 'male', label: 'Male' };
  return { id: raw || 'open', label: raw ? titleCase(raw) : 'Open' };
}

function normalizeExperience(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return { id: 'open', label: 'Open' };
  return { id: raw.replace(/\s+/g, '-'), label: titleCase(raw) };
}

function calculateAge(dateOfBirth, onDate) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  const event = new Date(onDate || Date.now());
  if (Number.isNaN(birth.getTime()) || Number.isNaN(event.getTime())) return null;

  let age = event.getFullYear() - birth.getFullYear();
  const monthDelta = event.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && event.getDate() < birth.getDate())) age -= 1;
  return age;
}

function getAgeGroup(age) {
  if (age === null || age === undefined) return { id: 'open', label: 'Open' };
  return AGE_GROUPS.find((group) => age >= group.min && age <= group.max) || AGE_GROUPS[AGE_GROUPS.length - 1];
}

function buildCategoryId({ discipline, ageGroupId, genderId, weightClass, experienceId }) {
  return [
    String(discipline || 'open').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    ageGroupId,
    genderId,
    String(weightClass || 'open').trim().toLowerCase().replace(/[^a-z0-9+]+/g, '-'),
    experienceId,
  ].join(':');
}

function getBracketSize(count) {
  return [2, 4, 8, 16, 32].find((size) => count <= size) || null;
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

function getRoundLabel(roundIndex, totalRounds) {
  const remaining = totalRounds - roundIndex;
  if (remaining === 0) return 'Final';
  if (remaining === 1) return 'Semifinal';
  if (remaining === 2) return 'Quarterfinal';
  return `Round ${roundIndex + 1}`;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = (i * 7 + 3) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getSeededSlots(entries, size) {
  const order = createSeedOrder(size);
  const ordered = [...entries].sort((a, b) => b.seedScore - a.seedScore);
  const slots = Array(size).fill(null);
  order.forEach((seed, index) => {
    slots[index] = ordered[seed - 1] || null;
  });
  return slots;
}

function getOpenSlots(entries, size) {
  const shuffled = shuffle(entries);
  const slots = Array(size).fill(null);
  shuffled.forEach((entry, index) => {
    slots[index] = entry;
  });
  return slots;
}

function buildPairings(slots) {
  const pairs = [];
  for (let i = 0; i < slots.length; i += 2) {
    pairs.push([slots[i] || null, slots[i + 1] || null]);
  }
  return pairs;
}

function evaluateSlots(slots, presetId) {
  const penalties = [];
  const pairs = buildPairings(slots);
  let total = 0;

  pairs.forEach(([left, right], index) => {
    if (!left || !right) {
      if (!left && !right) {
        total += 12;
        penalties.push({ code: 'double_bye', severity: 'medium', points: 12, message: `Match ${index + 1} is empty because of bracket sizing.` });
      }
      return;
    }

    if (left.club && right.club && left.club === right.club) {
      const points = presetId === 'open_draw' ? 45 : 120;
      total += points;
      penalties.push({
        code: 'same_club',
        severity: 'critical',
        points,
        message: `${left.participantName} and ${right.participantName} are from ${left.club} in round 1.`,
      });
    }

    const seedGap = Math.abs((left.seedScore || 0) - (right.seedScore || 0));
    if (seedGap >= 14) {
      const points = presetId === 'seeded_championship' ? 8 : 18;
      total += points;
      penalties.push({
        code: 'seed_gap',
        severity: 'low',
        points,
        message: `Match ${index + 1} has a ${seedGap}-point seed gap.`,
      });
    }
  });

  return {
    totalPenalty: total,
    penalties,
    summary: {
      sameClubCollisions: penalties.filter((item) => item.code === 'same_club').length,
      largeSeedGaps: penalties.filter((item) => item.code === 'seed_gap').length,
      byes: pairs.filter(([left, right]) => !left || !right).length,
    },
  };
}

function optimizeFairDraw(entries, size, presetId) {
  const seeded = getSeededSlots(entries, size);
  let bestSlots = seeded;
  let bestEval = evaluateSlots(bestSlots, presetId);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidateEntries = presetId === 'seeded_championship'
      ? [...entries].sort((a, b) => b.seedScore - a.seedScore)
      : shuffle(entries);
    const candidateSlots = presetId === 'seeded_championship'
      ? getSeededSlots(candidateEntries, size)
      : getOpenSlots(candidateEntries, size);
    const candidateEval = evaluateSlots(candidateSlots, presetId);
    if (candidateEval.totalPenalty < bestEval.totalPenalty) {
      bestSlots = candidateSlots;
      bestEval = candidateEval;
    }
    if (bestEval.totalPenalty === 0) break;
  }

  return { slots: bestSlots, evaluation: bestEval };
}

function createFixtureSchedule(bracket) {
  if (!bracket) return [];
  const sessions = ['Morning Card', 'Prime Card', 'Final Block'];
  const cages = ['Cage A', 'Cage B'];
  let boutCounter = 1;

  return bracket.rounds.flatMap((round, roundIndex) =>
    round.matches
      .filter((match) => !match.sides.every((side) => side.isBye))
      .map((match, matchIndex) => ({
        id: `${bracket.id || bracket.categoryId}-fixture-${roundIndex + 1}-${matchIndex + 1}`,
        boutNumber: boutCounter++,
        label: match.label,
        roundLabel: round.label,
        session: sessions[Math.min(roundIndex, sessions.length - 1)],
        arena: cages[(roundIndex + matchIndex) % cages.length],
        scheduledAt: `${String(bracket.eventDate || '').slice(0, 10) || '2026-01-01'}T${String(9 + roundIndex * 2 + matchIndex).padStart(2, '0')}:00:00`,
        categoryLabel: bracket.categoryLabel,
        red: match.sides[0],
        blue: match.sides[1],
        status: match.status === 'bye' ? 'auto-advance' : match.status,
      }))
  );
}

function buildBracketFromSlots(category, slots, presetId, evaluation, options = {}) {
  const totalRounds = Math.log2(slots.length);
  const rounds = [];
  let currentSlots = slots.map((entry) => ({ entry, sourceMatchId: null, bye: !entry }));

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const matches = [];
    const nextSlots = [];

    for (let matchIndex = 0; matchIndex < currentSlots.length; matchIndex += 2) {
      const slotA = currentSlots[matchIndex];
      const slotB = currentSlots[matchIndex + 1];
      const matchId = `r${roundIndex + 1}-m${matchIndex / 2 + 1}`;
      const autoWinner =
        slotA?.entry && !slotB?.entry ? slotA
          : !slotA?.entry && slotB?.entry ? slotB
            : null;
      const conflict =
        roundIndex === 0 && slotA?.entry && slotB?.entry && slotA.entry.club && slotA.entry.club === slotB.entry.club
          ? {
            level: 'critical',
            reason: 'same_club',
            message: 'Same-club collision',
          }
          : null;

      matches.push({
        id: matchId,
        round: roundIndex + 1,
        label: roundIndex === 0 ? `Bout ${matchIndex / 2 + 1}` : `Match ${matchIndex / 2 + 1}`,
        sides: [
          {
            name: slotA?.entry?.participantName || (slotA?.sourceMatchId ? `Winner ${slotA.sourceMatchId}` : 'Bye'),
            club: slotA?.entry?.club || null,
            nationality: slotA?.entry?.nationality || null,
            seedScore: slotA?.entry?.seedScore || null,
            participantId: slotA?.entry?.participantId || null,
            applicationId: slotA?.entry?.applicationId || null,
            isBye: !slotA?.entry,
            corner: 'red',
          },
          {
            name: slotB?.entry?.participantName || (slotB?.sourceMatchId ? `Winner ${slotB.sourceMatchId}` : 'Bye'),
            club: slotB?.entry?.club || null,
            nationality: slotB?.entry?.nationality || null,
            seedScore: slotB?.entry?.seedScore || null,
            participantId: slotB?.entry?.participantId || null,
            applicationId: slotB?.entry?.applicationId || null,
            isBye: !slotB?.entry,
            corner: 'blue',
          },
        ],
        status: autoWinner ? 'bye' : roundIndex === 0 ? 'scheduled' : 'pending',
        conflict,
      });

      nextSlots.push({
        entry: autoWinner?.entry || null,
        sourceMatchId: autoWinner ? null : matchId.toUpperCase(),
        bye: !autoWinner?.entry,
      });
    }

    rounds.push({
      id: `round-${roundIndex + 1}`,
      label: getRoundLabel(roundIndex, totalRounds),
      matches,
    });
    currentSlots = nextSlots;
  }

  const bracket = {
    id: options.id || null,
    categoryId: category.id,
    categoryLabel: category.label,
    rulesetLabel: category.rulesetLabel,
    bracketSize: slots.length,
    entryCount: category.approvedCount,
    seeding: presetId,
    seedingLabel: GENERATION_PRESETS.find((preset) => preset.id === presetId)?.label || presetId,
    status: options.status || 'draft',
    eventDate: category.eventDate,
    rounds,
    generation: {
      presetId,
      summary: evaluation.summary,
      penalties: evaluation.penalties,
      score: evaluation.totalPenalty,
    },
    policy: {
      sameClub: 'avoid_if_possible',
      sameCategoryOnly: true,
      fixtureType: category.approvedCount === 3 ? 'round-robin recommended' : 'single elimination',
    },
  };

  return {
    ...bracket,
    fixtures: createFixtureSchedule(bracket),
  };
}

function generateBracket(category, options = {}) {
  const approvedEntries = [...category.entries].filter((entry) => entry.reviewStatus === 'approved' && !entry.invalid);
  const size = getBracketSize(approvedEntries.length);
  if (!size || approvedEntries.length < 2) return null;

  const presetId = options.seeding || 'fair_draw';
  let slots;
  let evaluation;

  if (presetId === 'open_draw') {
    slots = getOpenSlots(approvedEntries, size);
    evaluation = evaluateSlots(slots, presetId);
  } else {
    ({ slots, evaluation } = optimizeFairDraw(approvedEntries, size, presetId));
  }

  return buildBracketFromSlots(category, slots, presetId, evaluation, options);
}

function advanceBracketWinner(bracket, roundIndex, matchIndex, sideIndex) {
  const rounds = (bracket.rounds || []).map((round) => ({
    ...round,
    matches: (round.matches || []).map((match) => ({
      ...match,
      sides: (match.sides || []).map((side) => ({ ...side })),
    })),
  }));

  const match = rounds[roundIndex]?.matches?.[matchIndex];
  const winner = match?.sides?.[sideIndex];
  if (!match || !winner || winner.isBye) return bracket;

  match.winnerIndex = sideIndex;
  match.status = roundIndex === rounds.length - 1 ? 'completed' : 'decided';

  if (roundIndex < rounds.length - 1) {
    const nextMatch = rounds[roundIndex + 1].matches[Math.floor(matchIndex / 2)];
    const nextSideIndex = matchIndex % 2;
    nextMatch.sides[nextSideIndex] = {
      ...winner,
      isBye: false,
    };
    if (nextMatch.sides.every((side) => !side.isBye)) nextMatch.status = 'scheduled';
  }

  const nextBracket = {
    ...bracket,
    status: roundIndex === rounds.length - 1 ? 'completed' : bracket.status === 'draft' ? 'live' : bracket.status,
    rounds,
  };
  return {
    ...nextBracket,
    fixtures: createFixtureSchedule(nextBracket),
  };
}

function normalizeStoredBracket(row) {
  return {
    ...(row.payload || {}),
    id: row.id,
    tournamentId: row.tournament_id,
    categoryId: row.category_id,
    categoryLabel: row.category_label,
    seeding: row.seeding,
    status: row.status,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function buildCategoryReport(entries) {
  const grouped = new Map();

  entries.forEach((entry) => {
    if (!grouped.has(entry.categoryId)) {
      grouped.set(entry.categoryId, {
        id: entry.categoryId,
        label: entry.categoryLabel,
        rulesetLabel: entry.rulesetLabel,
        disciplineLabel: entry.disciplineLabel,
        ageGroupLabel: entry.ageGroupLabel,
        genderLabel: entry.genderLabel,
        weightClassLabel: entry.weightClassLabel,
        experienceLabel: entry.experienceLabel,
        tournamentId: entry.tournamentId,
        tournamentName: entry.tournamentName,
        eventDate: entry.eventDate,
        entries: [],
        approvedCount: 0,
        invalidCount: 0,
        uniqueClubs: new Set(),
      });
    }

    const category = grouped.get(entry.categoryId);
    category.entries.push(entry);
    if (entry.reviewStatus === 'approved') category.approvedCount += 1;
    if (entry.invalid) category.invalidCount += 1;
    if (entry.club) category.uniqueClubs.add(entry.club);
  });

  return Array.from(grouped.values())
    .map((category) => ({
      ...category,
      clubCount: category.uniqueClubs.size,
      readyForBracket: category.approvedCount >= 2 && category.invalidCount === 0,
      tooFewFighters: category.approvedCount > 0 && category.approvedCount < 4,
      uniqueClubs: Array.from(category.uniqueClubs),
      status:
        category.approvedCount >= 4 && category.invalidCount === 0
          ? 'ready'
          : category.approvedCount >= 2 && category.invalidCount === 0
            ? 'watch'
            : category.invalidCount > 0
              ? 'review'
              : 'building',
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function listBracketEntries(tournamentId) {
  const { rows } = await query(
    `
      SELECT
        a.id AS application_id,
        a.decided_at,
        p.id AS profile_id,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        p.gender,
        p.nationality,
        p.discipline,
        p.weight_kg,
        p.weight_class,
        p.record_wins,
        p.record_losses,
        p.record_draws,
        p.metadata,
        c.name AS club_name,
        t.id AS tournament_id,
        t.name AS tournament_name,
        t.starts_on
      FROM applications a
      JOIN profiles p ON p.id = a.profile_id
      LEFT JOIN clubs c ON c.id = a.club_id
      JOIN tournaments t ON t.id = a.tournament_id
      WHERE a.deleted_at IS NULL
        AND a.status = 'approved'
        AND a.tournament_id = $1
      ORDER BY COALESCE(c.name, 'zzzzzz'), p.first_name ASC, p.last_name ASC, a.decided_at DESC
    `,
    [tournamentId]
  );

  return rows.map((row) => {
    const gender = normalizeGender(row.gender);
    const experience = normalizeExperience(row.metadata?.experienceLevel);
    const age = calculateAge(row.date_of_birth, row.starts_on || Date.now());
    const ageGroup = getAgeGroup(age);
    const disciplineLabel = row.discipline || 'Open division';
    const weightClassLabel = row.weight_class || 'Open';
    const categoryId = buildCategoryId({
      discipline: disciplineLabel,
      ageGroupId: ageGroup.id,
      genderId: gender.id,
      weightClass: weightClassLabel,
      experienceId: experience.id,
    });

    const wins = Number(row.record_wins || 0);
    const losses = Number(row.record_losses || 0);
    const draws = Number(row.record_draws || 0);
    const ageBonus = age === null ? 0 : Math.max(0, 40 - age);
    const seedScore = Math.max(1, 50 + wins * 4 - losses * 2 + draws + ageBonus);

    return {
      id: `${row.application_id}:${row.profile_id}`,
      applicationId: row.application_id,
      participantId: row.profile_id,
      participantName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      club: row.club_name || null,
      nationality: row.nationality || null,
      disciplineLabel,
      rulesetLabel: disciplineLabel,
      gender: gender.id,
      genderLabel: gender.label,
      age,
      ageGroupId: ageGroup.id,
      ageGroupLabel: ageGroup.label,
      weight: row.weight_kg === null ? null : Number(row.weight_kg),
      weightClassLabel,
      experienceLevel: experience.id,
      experienceLabel: experience.label,
      reviewStatus: 'approved',
      invalid: false,
      tournamentId: row.tournament_id,
      tournamentName: row.tournament_name,
      eventDate: row.starts_on,
      categoryId,
      categoryLabel: `${disciplineLabel} · ${ageGroup.label} · ${gender.label} · ${weightClassLabel} · ${experience.label}`,
      seedScore,
    };
  });
}

async function listStoredBrackets(tournamentId) {
  const { rows } = await query(
    `SELECT * FROM brackets WHERE tournament_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
    [tournamentId]
  );
  return rows.map(normalizeStoredBracket);
}

async function findStoredBracketById(bracketId) {
  const { rows } = await query(`SELECT * FROM brackets WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [bracketId]);
  return rows[0] ? normalizeStoredBracket(rows[0]) : null;
}

async function saveBracket({ actorUserId, tournamentId, category, bracket }) {
  const { rows } = await query(
    `
      INSERT INTO brackets (tournament_id, category_id, category_label, seeding, status, payload, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
      ON CONFLICT (tournament_id, category_id)
      DO UPDATE SET
        category_label = EXCLUDED.category_label,
        seeding = EXCLUDED.seeding,
        status = EXCLUDED.status,
        payload = EXCLUDED.payload,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW(),
        deleted_at = NULL
      RETURNING *
    `,
    [
      tournamentId,
      category.id,
      category.label,
      bracket.seeding,
      bracket.status,
      JSON.stringify({ ...bracket, tournamentId }),
      actorUserId,
    ]
  );
  return normalizeStoredBracket(rows[0]);
}

async function softDeleteBracket(id) {
  await query(`UPDATE brackets SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

async function resolveTournamentId(requestedTournamentId) {
  if (requestedTournamentId) {
    const tournament = await tournamentsRepo.findById(requestedTournamentId);
    if (!tournament) throw ApiError.notFound('Tournament not found');
    return requestedTournamentId;
  }

  const tournaments = await tournamentsRepo.listAdmin({ limit: 1, offset: 0 });
  return tournaments[0]?.id || null;
}

async function refreshSuggestedForTournament(tournamentId, { actorUserId = null, force = false } = {}) {
  const selectedTournamentId = await resolveTournamentId(tournamentId);
  if (!selectedTournamentId) return {};
  await divisionService.syncTournamentSystem(selectedTournamentId);
  return {};
}

async function overview(actor, { tournamentId } = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();

  const tournaments = await tournamentsRepo.listAdmin({ limit: 200, offset: 0 });
  const selectedTournamentId = await resolveTournamentId(tournamentId);
  const selectedTournament = selectedTournamentId
    ? tournaments.find((item) => item.id === selectedTournamentId) || await tournamentsRepo.findById(selectedTournamentId)
    : null;

  if (!selectedTournamentId || !selectedTournament) {
    return {
      tournaments,
      selectedTournamentId: null,
      selectedTournament: null,
      categories: [],
      brackets: {},
      generationPresets: GENERATION_PRESETS,
    };
  }

  const entries = await listBracketEntries(selectedTournamentId);
  const categories = buildCategoryReport(entries);
  const brackets = await refreshSuggestedForTournament(selectedTournamentId, { actorUserId: actor.id });

  return {
    tournaments,
    selectedTournamentId,
    selectedTournament,
    categories,
    brackets,
    generationPresets: GENERATION_PRESETS,
  };
}

async function generate(actor, { tournamentId, categoryId, seeding }, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  if (!GENERATION_PRESETS.some((preset) => preset.id === seeding)) {
    throw ApiError.unprocessable('Unknown bracket generation preset', { field: 'seeding' });
  }

  const selectedTournamentId = await resolveTournamentId(tournamentId);
  if (!selectedTournamentId) throw ApiError.notFound('No tournament available');

  const categories = buildCategoryReport(await listBracketEntries(selectedTournamentId));
  const category = categories.find((item) => item.id === categoryId);
  if (!category) throw ApiError.notFound('Bracket category not found');
  if (!category.readyForBracket) throw ApiError.unprocessable('Category is not ready for bracket generation');

  const bracket = generateBracket(category, { seeding, status: 'draft' });
  if (!bracket) throw ApiError.unprocessable('Unable to generate bracket for this category');

  const saved = await saveBracket({ actorUserId: actor.id, tournamentId: selectedTournamentId, category, bracket });
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'bracket.generate',
    entityType: 'bracket',
    entityId: saved.id,
    payload: { tournamentId: selectedTournamentId, categoryId, seeding },
    requestIp: ctx.ip,
  });
  return saved;
}

async function update(actor, bracketId, { status }, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  if (!BRACKET_STATUSES.has(status)) throw ApiError.unprocessable('Unknown bracket status', { field: 'status' });

  const existing = await findStoredBracketById(bracketId);
  if (!existing) throw ApiError.notFound('Bracket not found');

  const saved = await saveBracket({
    actorUserId: actor.id,
    tournamentId: existing.tournamentId,
    category: { id: existing.categoryId, label: existing.categoryLabel },
    bracket: {
      ...existing,
      status,
    },
  });

  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'bracket.update',
    entityType: 'bracket',
    entityId: saved.id,
    payload: { previousStatus: existing.status, status },
    requestIp: ctx.ip,
  });
  return saved;
}

async function advance(actor, bracketId, { roundIndex, matchIndex, sideIndex }, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const current = await findStoredBracketById(bracketId);
  if (!current) throw ApiError.notFound('Bracket not found');

  const nextBracket = advanceBracketWinner(current, Number(roundIndex), Number(matchIndex), Number(sideIndex));
  const saved = await saveBracket({
    actorUserId: actor.id,
    tournamentId: current.tournamentId,
    category: { id: current.categoryId, label: current.categoryLabel },
    bracket: nextBracket,
  });

  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'bracket.advance',
    entityType: 'bracket',
    entityId: saved.id,
    payload: { roundIndex, matchIndex, sideIndex },
    requestIp: ctx.ip,
  });

  return saved;
}

module.exports = {
  overview,
  generate,
  update,
  advance,
  findStoredBracketById,
  refreshSuggestedForTournament,
};

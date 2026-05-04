const { randomUUID } = require('crypto');
const { query, transaction } = require('../db');
const { tournaments: tournamentsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');
const { buildOfficialCategory } = require('../domain/categoryRules');

const AGE_BANDS = [
  { id: 'cadet', label: 'Cadet', min: 12, max: 15 },
  { id: 'junior', label: 'Junior', min: 16, max: 17 },
  { id: 'adult', label: 'Adult', min: 18, max: 34 },
  { id: 'master', label: 'Master', min: 35, max: 45 },
  { id: 'veteran', label: 'Veteran', min: 46, max: 120 },
];

function assertAdmin(actor) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
  return { id: slugify(raw), label: titleCase(raw) };
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

function getAgeBand(age) {
  if (age === null || age === undefined) return { id: 'open', label: 'Open' };
  return AGE_BANDS.find((band) => age >= band.min && age <= band.max) || AGE_BANDS[AGE_BANDS.length - 1];
}

function expandDisciplines(application) {
  const selections = Array.isArray(application.form_data?.selectedDisciplines)
    ? application.form_data.selectedDisciplines
    : [];
  const values = selections.length ? selections : [application.discipline].filter(Boolean);
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function computeSeedScore(application) {
  const wins = Number(application.record_wins || 0);
  const losses = Number(application.record_losses || 0);
  const draws = Number(application.record_draws || 0);
  const age = calculateAge(application.date_of_birth, application.starts_on || Date.now());
  const ageBonus = age === null ? 0 : Math.max(0, 40 - age);
  return Math.max(1, 50 + wins * 4 - losses * 2 + draws + ageBonus);
}

function buildDivisionLabel({ disciplineLabel, genderLabel, ageBandLabel, weightClassLabel, experienceLabel }) {
  return `${disciplineLabel} · ${ageBandLabel} · ${genderLabel} · ${weightClassLabel} · ${experienceLabel}`;
}

function normalizeDivisionRow(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    disciplineId: row.discipline_id,
    disciplineSlug: row.discipline_slug,
    disciplineName: row.discipline_name,
    sex: row.sex,
    ageBand: row.age_band,
    weightClass: row.weight_class,
    experienceLevel: row.experience_level,
    format: row.format,
    label: row.label,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fighterCount: Number(row.fighter_count || 0),
    ready: Number(row.fighter_count || 0) > 1,
    generated: Number(row.match_count || 0) > 0,
    matchCount: Number(row.match_count || 0),
    conflictCount: Number(row.conflict_count || 0),
    championName: row.champion_name || null,
    championClubName: row.champion_club_name || null,
  };
}

async function listApprovedApplicationsForTournament(tournamentId) {
  const { rows } = await query(
    `
      SELECT
        a.id AS application_id,
        a.form_data,
        a.status,
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
        c.id AS club_id,
        c.name AS club_name,
        t.starts_on
      FROM applications a
      JOIN profiles p ON p.id = a.profile_id
      LEFT JOIN clubs c ON c.id = a.club_id
      JOIN tournaments t ON t.id = a.tournament_id
      WHERE a.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND a.tournament_id = $1
        AND a.status = 'approved'
      ORDER BY p.first_name ASC, p.last_name ASC, a.decided_at DESC
    `,
    [tournamentId]
  );
  return rows;
}

async function ensureDiscipline(client, name) {
  const disciplineName = titleCase(name);
  const slug = slugify(name);
  const { rows } = await client.query(
    `
      INSERT INTO disciplines (slug, name)
      VALUES ($1, $2)
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        deleted_at = NULL,
        updated_at = NOW()
      RETURNING *
    `,
    [slug, disciplineName]
  );
  return rows[0];
}

async function syncTournament(actor, tournamentId, ctx = {}) {
  assertAdmin(actor);
  const tournament = await tournamentsRepo.findById(tournamentId);
  if (!tournament) throw ApiError.notFound('Tournament not found');

  const applications = await listApprovedApplicationsForTournament(tournamentId);
  const desired = [];
  for (const application of applications) {
    const disciplines = expandDisciplines(application);
    for (const disciplineRaw of disciplines) {
      const gender = normalizeGender(application.gender);
      const category = buildOfficialCategory({
        disciplineId: disciplineRaw,
        gender: application.gender,
        dateOfBirth: application.date_of_birth,
        weightKg: application.form_data?.weightKg || application.weight_kg,
        onDate: tournament.starts_on || Date.now(),
      });
      if (!category.valid) {
        throw ApiError.unprocessable('Approved application has invalid official category data', {
          applicationId: application.application_id,
          disciplineId: disciplineRaw,
          issues: category.issues,
        });
      }
      const ageBand = {
        id: category.division.id,
        label: category.division.label,
      };
      const experience = { id: 'open', label: 'Open' };
      const disciplineLabel = category.discipline?.label || titleCase(disciplineRaw);
      const weightClass = category.weightClass?.label || 'Grouped by height, weight & size';
      desired.push({
        applicationId: application.application_id,
        profileId: application.profile_id,
        participantName: `${application.first_name || ''} ${application.last_name || ''}`.trim(),
        clubId: application.club_id,
        clubName: application.club_name || null,
        nationality: application.nationality || null,
        seedScore: computeSeedScore(application),
        disciplineName: disciplineLabel,
        sex: gender.id,
        ageBand: ageBand.id,
        weightClass,
        experienceLevel: experience.id,
        label: buildDivisionLabel({
          disciplineLabel,
          genderLabel: gender.label,
          ageBandLabel: ageBand.label,
          weightClassLabel: weightClass,
          experienceLabel: experience.label,
        }),
        metadata: {
          nationality: application.nationality || null,
          genderLabel: gender.label,
          ageBandLabel: ageBand.label,
          experienceLabel: experience.label,
          disciplineLabel,
        },
      });
    }
  }

  const activeEntryIds = [];
  await transaction(async (client) => {
    for (const item of desired) {
      const discipline = await ensureDiscipline(client, item.disciplineName);
      const divisionRes = await client.query(
        `
          INSERT INTO divisions (tournament_id, discipline_id, sex, age_band, weight_class, experience_level, label)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (tournament_id, discipline_id, sex, age_band, weight_class, experience_level)
          DO UPDATE SET
            label = EXCLUDED.label,
            deleted_at = NULL,
            updated_at = NOW()
          RETURNING *
        `,
        [tournamentId, discipline.id, item.sex, item.ageBand, item.weightClass, item.experienceLevel, item.label]
      );
      const division = divisionRes.rows[0];
      const entryRes = await client.query(
        `
          INSERT INTO division_entries (
            division_id, application_id, profile_id, participant_name, club_id, club_name, seed,
            derived_seed_score, status, metadata
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9)
          ON CONFLICT (division_id, application_id)
          DO UPDATE SET
            profile_id = EXCLUDED.profile_id,
            participant_name = EXCLUDED.participant_name,
            club_id = EXCLUDED.club_id,
            club_name = EXCLUDED.club_name,
            seed = COALESCE(division_entries.seed, EXCLUDED.seed),
            derived_seed_score = EXCLUDED.derived_seed_score,
            status = EXCLUDED.status,
            metadata = EXCLUDED.metadata,
            deleted_at = NULL,
            updated_at = NOW()
          RETURNING id
        `,
        [
          division.id,
          item.applicationId,
          item.profileId,
          item.participantName,
          item.clubId,
          item.clubName,
          null,
          item.seedScore,
          item.metadata,
        ]
      );
      activeEntryIds.push(entryRes.rows[0].id);
    }

    if (activeEntryIds.length) {
      await client.query(
        `
          UPDATE division_entries
          SET deleted_at = NOW(), updated_at = NOW()
          WHERE id IN (
            SELECT de.id
            FROM division_entries de
            JOIN divisions d ON d.id = de.division_id
            WHERE d.tournament_id = $1
              AND d.deleted_at IS NULL
              AND de.deleted_at IS NULL
              AND NOT (de.id = ANY($2::uuid[]))
          )
        `,
        [tournamentId, activeEntryIds]
      );
    } else {
      await client.query(
        `
          UPDATE division_entries
          SET deleted_at = NOW(), updated_at = NOW()
          WHERE id IN (
            SELECT de.id
            FROM division_entries de
            JOIN divisions d ON d.id = de.division_id
            WHERE d.tournament_id = $1
              AND d.deleted_at IS NULL
              AND de.deleted_at IS NULL
          )
        `,
        [tournamentId]
      );
    }

    await client.query(
      `
        UPDATE divisions
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE tournament_id = $1
          AND deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM division_entries de
            WHERE de.division_id = divisions.id
              AND de.deleted_at IS NULL
          )
      `,
      [tournamentId]
    );
  });

  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'division.sync',
    entityType: 'tournament',
    entityId: tournamentId,
    payload: { entryCount: desired.length },
    requestIp: ctx.ip,
  });

  return listForTournament(actor, tournamentId);
}

async function syncTournamentSystem(tournamentId) {
  const systemActor = { id: null, role: 'admin' };
  return syncTournament(systemActor, tournamentId, {});
}

async function listForTournament(actor, tournamentId) {
  assertAdmin(actor);
  const tournament = await tournamentsRepo.findById(tournamentId);
  if (!tournament) throw ApiError.notFound('Tournament not found');
  const { rows } = await query(
    `
      SELECT
        d.*,
        discipline.slug AS discipline_slug,
        discipline.name AS discipline_name,
        COUNT(DISTINCT de.id) FILTER (WHERE de.deleted_at IS NULL AND de.status = 'approved')::int AS fighter_count,
        COUNT(DISTINCT m.id) FILTER (WHERE m.deleted_at IS NULL)::int AS match_count,
        COUNT(DISTINCT m.id) FILTER (WHERE m.deleted_at IS NULL AND m.conflict IS NOT NULL)::int AS conflict_count,
        COALESCE(
          champion.participant_name,
          (
            SELECT sole.participant_name
            FROM division_entries sole
            WHERE sole.division_id = d.id
              AND sole.deleted_at IS NULL
              AND sole.status = 'approved'
            ORDER BY sole.participant_name ASC
            LIMIT 1
          )
        ) AS champion_name,
        COALESCE(
          champion.club_name,
          (
            SELECT sole.club_name
            FROM division_entries sole
            WHERE sole.division_id = d.id
              AND sole.deleted_at IS NULL
              AND sole.status = 'approved'
            ORDER BY sole.participant_name ASC
            LIMIT 1
          )
        ) AS champion_club_name
      FROM divisions d
      JOIN disciplines discipline ON discipline.id = d.discipline_id
      LEFT JOIN division_entries de ON de.division_id = d.id
      LEFT JOIN matches m ON m.division_id = d.id
      LEFT JOIN division_entries champion ON champion.id = (
        SELECT m2.winner_entry_id
        FROM matches m2
        WHERE m2.division_id = d.id
          AND m2.deleted_at IS NULL
        ORDER BY m2.round_number DESC, m2.match_number DESC
        LIMIT 1
      )
      WHERE d.tournament_id = $1
        AND d.deleted_at IS NULL
      GROUP BY d.id, discipline.slug, discipline.name, champion.participant_name, champion.club_name
      ORDER BY discipline.name ASC, d.sex ASC, d.age_band ASC, d.weight_class ASC, d.experience_level ASC
    `,
    [tournamentId]
  );
  return rows.map(normalizeDivisionRow);
}

async function listEntriesForDivision(divisionId) {
  const { rows } = await query(
    `
      SELECT *
      FROM division_entries
      WHERE division_id = $1
        AND deleted_at IS NULL
        AND status = 'approved'
      ORDER BY seed NULLS LAST, derived_seed_score DESC, participant_name ASC
    `,
    [divisionId]
  );
  return rows.map((row) => ({
    id: row.id,
    applicationId: row.application_id,
    profileId: row.profile_id,
    participantName: row.participant_name,
    clubId: row.club_id,
    clubName: row.club_name,
    seed: row.seed,
    derivedSeedScore: row.derived_seed_score,
    metadata: row.metadata || {},
  }));
}

async function setManualSeeds(actor, divisionId, seeds, ctx = {}) {
  assertAdmin(actor);
  const normalized = Array.isArray(seeds) ? seeds : [];
  const seen = new Set();
  normalized.forEach((item) => {
    if (!item.seed) return;
    if (seen.has(item.seed)) {
      throw ApiError.unprocessable('Manual seeds must be unique within a division', { field: 'seeds' });
    }
    seen.add(item.seed);
  });
  await transaction(async (client) => {
    for (const item of normalized) {
      await client.query(
        `
          UPDATE division_entries
          SET seed = $1, updated_at = NOW()
          WHERE id = $2
            AND division_id = $3
            AND deleted_at IS NULL
        `,
        [item.seed || null, item.entryId, divisionId]
      );
    }
  });
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'division.manual_seeds',
    entityType: 'division',
    entityId: divisionId,
    payload: { count: normalized.length },
    requestIp: ctx.ip,
  });
  return listEntriesForDivision(divisionId);
}

async function getDivision(actor, divisionId) {
  assertAdmin(actor);
  const { rows } = await query(
    `
      SELECT d.*, t.name AS tournament_name, discipline.slug AS discipline_slug, discipline.name AS discipline_name
      FROM divisions d
      JOIN tournaments t ON t.id = d.tournament_id
      JOIN disciplines discipline ON discipline.id = d.discipline_id
      WHERE d.id = $1 AND d.deleted_at IS NULL
      LIMIT 1
    `,
    [divisionId]
  );
  const division = rows[0];
  if (!division) throw ApiError.notFound('Division not found');
  return {
    ...normalizeDivisionRow(division),
    tournamentName: division.tournament_name,
  };
}

module.exports = {
  syncTournament,
  syncTournamentSystem,
  listForTournament,
  listEntriesForDivision,
  setManualSeeds,
  getDivision,
  normalizeDivisionRow,
};

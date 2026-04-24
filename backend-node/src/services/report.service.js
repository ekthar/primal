const { query } = require('../db');
const { getProductionReadiness } = require('../config');
const { formatPersonName, applicationDisplayId } = require('./identity.service');

function formatDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeParticipantRow(row) {
  const age = row.age_today === null || row.age_today === undefined
    ? null
    : Number.parseInt(row.age_today, 10);
  return {
    applicationId: row.application_id,
    applicationDisplayId: applicationDisplayId(row.application_id),
    profileId: row.profile_id,
    participantName: formatPersonName(row.first_name, row.last_name),
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: formatDateOnly(row.date_of_birth),
    ageToday: Number.isNaN(age) ? null : age,
    sex: row.gender || null,
    discipline: row.discipline || null,
    clubId: row.club_id || null,
    clubName: row.club_name || null,
    tournamentId: row.tournament_id,
    tournamentName: row.tournament_name,
    approvedAt: row.decided_at,
  };
}

async function listApprovedParticipants({ tournamentId } = {}) {
  const args = [];
  const where = [`a.deleted_at IS NULL`, `a.status = 'approved'`];
  if (tournamentId) {
    args.push(tournamentId);
    where.push(`a.tournament_id = $${args.length}`);
  }

  const sql = `
    SELECT
      a.id AS application_id,
      a.decided_at,
      p.id AS profile_id,
      p.first_name,
      p.last_name,
      p.date_of_birth,
      p.gender,
      p.discipline,
      c.id AS club_id,
      c.name AS club_name,
      t.id AS tournament_id,
      t.name AS tournament_name,
      DATE_PART('year', AGE(CURRENT_DATE, p.date_of_birth))::int AS age_today
    FROM applications a
    JOIN profiles p ON p.id = a.profile_id
    LEFT JOIN clubs c ON c.id = a.club_id
    JOIN tournaments t ON t.id = a.tournament_id
    WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(c.name, 'zzzzzz'), p.first_name ASC, p.last_name ASC, a.decided_at DESC
  `;

  const { rows } = await query(sql, args);
  return rows.map(normalizeParticipantRow);
}

async function approvedParticipantReport(filters = {}) {
  const rows = await listApprovedParticipants(filters);
  const clubParticipants = rows.filter((r) => !!r.clubId);
  const individualParticipants = rows.filter((r) => !r.clubId);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      approvedApplications: rows.length,
      clubParticipants: clubParticipants.length,
      individualParticipants: individualParticipants.length,
    },
    clubParticipants,
    individualParticipants,
  };
}

function emptyStatusTotals() {
  return {
    draft: 0,
    submitted: 0,
    under_review: 0,
    needs_correction: 0,
    approved: 0,
    rejected: 0,
    season_closed: 0,
    total: 0,
  };
}

function incrementStatusBucket(bucket, status) {
  const next = { ...bucket };
  const key = next[status] === undefined ? null : status;
  if (key) next[key] += 1;
  next.total += 1;
  return next;
}

function normalizeGroupRows(groupMap) {
  return Array.from(groupMap.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function appendUniqueName(list, value) {
  if (!value) return;
  if (!list.includes(value)) list.push(value);
}

async function groupedApplicationReport(filters = {}) {
  const args = [];
  const where = [`a.deleted_at IS NULL`];

  if (filters.tournamentId) {
    args.push(filters.tournamentId);
    where.push(`a.tournament_id = $${args.length}`);
  }

  if (filters.discipline) {
    args.push(filters.discipline);
    where.push(`COALESCE(discipline.name, p.discipline, 'Open') = $${args.length}`);
  }

  const { rows } = await query(`
    SELECT
      a.id AS application_id,
      a.status,
      a.tournament_id,
      t.name AS tournament_name,
      p.first_name,
      p.last_name,
      COALESCE(discipline.name, p.discipline, 'Open') AS discipline_label,
      COALESCE(d.weight_class, p.weight_class, 'Open') AS weight_class_label,
      d.id AS category_id,
      d.label AS category_label
    FROM applications a
    JOIN profiles p ON p.id = a.profile_id
    JOIN tournaments t ON t.id = a.tournament_id
    LEFT JOIN division_entries de
      ON de.application_id = a.id
     AND de.deleted_at IS NULL
    LEFT JOIN divisions d
      ON d.id = de.division_id
     AND d.deleted_at IS NULL
    LEFT JOIN disciplines discipline
      ON discipline.id = d.discipline_id
     AND discipline.deleted_at IS NULL
    WHERE ${where.join(' AND ')}
    ORDER BY tournament_name ASC, discipline_label ASC, weight_class_label ASC, category_label ASC NULLS LAST
  `, args);

  const disciplineGroups = new Map();
  const weightGroups = new Map();
  const categoryGroups = new Map();

  rows.forEach((row) => {
    const participantName = formatPersonName(row.first_name, row.last_name);
    const participantDetail = `${participantName}${row.application_id ? ` · ${applicationDisplayId(row.application_id)}` : ''}${row.club_name ? ` · ${row.club_name}` : ''}`;
    const disciplineKey = row.discipline_label || 'Open';
    const weightKey = row.weight_class_label || 'Open';
    const categoryId = row.category_id || 'ungrouped';
    const categoryLabel = row.category_label || 'Ungrouped / Not Generated';

    if (!disciplineGroups.has(disciplineKey)) {
      disciplineGroups.set(disciplineKey, {
        id: disciplineKey,
        label: disciplineKey,
        sampleApplicationDisplayId: applicationDisplayId(row.application_id),
        statuses: emptyStatusTotals(),
      });
    }

    if (!weightGroups.has(weightKey)) {
      weightGroups.set(weightKey, {
        id: weightKey,
        label: weightKey,
        sampleApplicationDisplayId: applicationDisplayId(row.application_id),
        statuses: emptyStatusTotals(),
      });
    }

    if (!categoryGroups.has(categoryId)) {
      categoryGroups.set(categoryId, {
        id: categoryId,
        label: categoryLabel,
        applicantName: participantName,
        participantNames: [],
        participantDetails: [],
        sampleApplicationDisplayId: applicationDisplayId(row.application_id),
        discipline: disciplineKey,
        weightClass: weightKey,
        statuses: emptyStatusTotals(),
      });
    }

    appendUniqueName(categoryGroups.get(categoryId).participantNames, participantName);
    appendUniqueName(categoryGroups.get(categoryId).participantDetails, participantDetail);

    disciplineGroups.get(disciplineKey).statuses = incrementStatusBucket(disciplineGroups.get(disciplineKey).statuses, row.status);
    weightGroups.get(weightKey).statuses = incrementStatusBucket(weightGroups.get(weightKey).statuses, row.status);
    categoryGroups.get(categoryId).statuses = incrementStatusBucket(categoryGroups.get(categoryId).statuses, row.status);
  });

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      tournamentId: filters.tournamentId || null,
      discipline: filters.discipline || null,
    },
    totals: rows.reduce((accumulator, row) => incrementStatusBucket(accumulator, row.status), emptyStatusTotals()),
    disciplineGroups: normalizeGroupRows(disciplineGroups),
    weightClassGroups: normalizeGroupRows(weightGroups),
    categoryGroups: normalizeGroupRows(categoryGroups).map((row) => ({
      ...row,
      participantNames: row.participantNames.slice().sort((left, right) => left.localeCompare(right)),
      participantDetails: row.participantDetails.slice().sort((left, right) => left.localeCompare(right)),
    })),
  };
}

async function notificationDiagnostics() {
  const { rows } = await query(`
    SELECT
      template,
      channel,
      status,
      COUNT(*)::int AS count
    FROM notifications
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY template, channel, status
    ORDER BY template ASC, channel ASC, status ASC
  `);

  const { rows: recentFailures } = await query(`
    SELECT
      id,
      created_at,
      template,
      channel,
      error,
      application_id,
      user_id
    FROM notifications
    WHERE status = 'failed'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  return {
    counts: rows,
    recentFailures,
  };
}

async function operationalAuditDiagnostics() {
  const { rows } = await query(`
    SELECT
      action,
      COUNT(*)::int AS count
    FROM audit_log
    WHERE occurred_at > NOW() - INTERVAL '7 days'
      AND action IN ('export.pdf', 'export.analytics_pdf', 'qr.verify', 'qr.verify.failed')
    GROUP BY action
  `);

  const counts = Object.fromEntries(rows.map((row) => [row.action, row.count]));

  return {
    exportsLast7d: (counts['export.pdf'] || 0) + (counts['export.analytics_pdf'] || 0),
    qrValidLast7d: counts['qr.verify'] || 0,
    qrFailedLast7d: counts['qr.verify.failed'] || 0,
  };
}

async function productionDiagnostics() {
  const [notifications, audit] = await Promise.all([
    notificationDiagnostics(),
    operationalAuditDiagnostics(),
  ]);

  return {
    readiness: getProductionReadiness(),
    notifications,
    audit,
  };
}

async function seasonalTournamentReport({ tournamentId }) {
  const { rows: tournaments } = await query(
    `SELECT * FROM tournaments WHERE id = $1 LIMIT 1`,
    [tournamentId]
  );
  const tournament = tournaments[0];
  if (!tournament) {
    const error = new Error('Tournament not found');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const { rows: registrations } = await query(
    `
      SELECT
        a.id AS application_id,
        a.status,
        a.submitted_at,
        a.decided_at,
        a.reviewer_id,
        p.id AS profile_id,
        p.first_name,
        p.last_name,
        p.gender,
        p.weight_class,
        p.weight_kg,
        p.discipline,
        p.date_of_birth,
        c.name AS club_name,
        COALESCE(d.label, 'Ungrouped / Not Generated') AS division_label,
        COALESCE(ds.name, p.discipline, 'Open') AS discipline_label
      FROM applications a
      JOIN profiles p ON p.id = a.profile_id
      LEFT JOIN clubs c ON c.id = a.club_id
      LEFT JOIN division_entries de ON de.application_id = a.id AND de.deleted_at IS NULL
      LEFT JOIN divisions d ON d.id = de.division_id AND d.deleted_at IS NULL
      LEFT JOIN disciplines ds ON ds.id = d.discipline_id AND ds.deleted_at IS NULL
      WHERE a.tournament_id = $1
        AND a.deleted_at IS NULL
      ORDER BY discipline_label ASC, division_label ASC, p.first_name ASC, p.last_name ASC
    `,
    [tournamentId]
  );

  const { rows: divisions } = await query(
    `
      SELECT
        d.id,
        d.label,
        d.sex,
        d.age_band,
        d.weight_class,
        d.experience_level,
        ds.name AS discipline_name,
        COUNT(DISTINCT de.id)::int AS fighter_count,
        COUNT(DISTINCT m.id)::int AS match_count,
        MAX(CASE WHEN m.status = 'completed' AND m.winner_entry_id IS NOT NULL THEN winner.participant_name END) AS champion_name,
        MAX(CASE WHEN m.status = 'completed' AND m.winner_entry_id IS NOT NULL THEN winner.club_name END) AS champion_club_name
      FROM divisions d
      LEFT JOIN disciplines ds ON ds.id = d.discipline_id
      LEFT JOIN division_entries de ON de.division_id = d.id AND de.deleted_at IS NULL
      LEFT JOIN matches m ON m.division_id = d.id AND m.deleted_at IS NULL
      LEFT JOIN division_entries winner ON winner.id = m.winner_entry_id
      WHERE d.tournament_id = $1
        AND d.deleted_at IS NULL
      GROUP BY d.id, d.label, d.sex, d.age_band, d.weight_class, d.experience_level, ds.name
      ORDER BY ds.name ASC NULLS LAST, d.label ASC
    `,
    [tournamentId]
  );

  const { rows: matches } = await query(
    `
      SELECT
        d.id AS division_id,
        d.label AS division_label,
        m.id AS match_id,
        m.round_number,
        m.match_number,
        m.status,
        e1.participant_name AS red_name,
        e1.club_name AS red_club,
        e2.participant_name AS blue_name,
        e2.club_name AS blue_club,
        winner.participant_name AS winner_name
      FROM divisions d
      LEFT JOIN matches m ON m.division_id = d.id AND m.deleted_at IS NULL
      LEFT JOIN division_entries e1 ON e1.id = m.entry1_id
      LEFT JOIN division_entries e2 ON e2.id = m.entry2_id
      LEFT JOIN division_entries winner ON winner.id = m.winner_entry_id
      WHERE d.tournament_id = $1
        AND d.deleted_at IS NULL
      ORDER BY d.label ASC, m.round_number ASC NULLS LAST, m.match_number ASC NULLS LAST
    `,
    [tournamentId]
  );

  return {
    generatedAt: new Date().toISOString(),
    tournament: {
      id: tournament.id,
      name: tournament.name,
      season: tournament.season,
      startsOn: tournament.starts_on,
      endsOn: tournament.ends_on,
      archivedAt: tournament.deleted_at,
      registrationOpenAt: tournament.registration_open_at,
      registrationCloseAt: tournament.registration_close_at,
    },
    totals: rowsToTotals(registrations),
    registrations: registrations.map((row) => ({
      applicationId: row.application_id,
      applicationDisplayId: applicationDisplayId(row.application_id),
      participantName: formatPersonName(row.first_name, row.last_name),
      status: row.status,
      discipline: row.discipline_label,
      category: row.division_label,
      gender: row.gender,
      weightClass: row.weight_class,
      weightKg: row.weight_kg,
      clubName: row.club_name || 'Individual',
      submittedAt: row.submitted_at,
      decidedAt: row.decided_at,
      bracketState: row.division_label === 'Ungrouped / Not Generated'
        ? (row.status === 'season_closed' ? 'Season closed before bracket' : 'Registered only')
        : 'Bracketed',
    })),
    divisions,
    matches: matches.map((row) => ({
      divisionId: row.division_id,
      divisionLabel: row.division_label,
      matchId: row.match_id,
      roundNumber: row.round_number,
      matchNumber: row.match_number,
      status: row.status,
      redName: row.red_name || 'TBD',
      redClub: row.red_club || null,
      blueName: row.blue_name || 'TBD',
      blueClub: row.blue_club || null,
      winnerName: row.winner_name || null,
    })),
  };
}

function rowsToTotals(registrations) {
  return registrations.reduce((totals, row) => {
    const next = incrementStatusBucket(totals, row.status);
    return next;
  }, emptyStatusTotals());
}

module.exports = {
  approvedParticipantReport,
  listApprovedParticipants,
  groupedApplicationReport,
  productionDiagnostics,
  seasonalTournamentReport,
};

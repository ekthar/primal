const { query } = require('../db');

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
    profileId: row.profile_id,
    participantName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
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

module.exports = {
  approvedParticipantReport,
  listApprovedParticipants,
};
// Thin data access layer (Postgres). No business rules here.
// Each repo is a set of composable pure functions taking a client or using pool.

const { query } = require('./db');

const ACTIVE = 'deleted_at IS NULL';

// --------- users ---------
const users = {
  findByEmail: async (email) => (await query(`SELECT * FROM users WHERE email=$1 AND ${ACTIVE}`, [email])).rows[0],
  findById: async (id) => (await query(`SELECT * FROM users WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  findByGoogleSub: async (sub) => (await query(`SELECT * FROM users WHERE google_sub=$1 AND ${ACTIVE}`, [sub])).rows[0],
  create: async ({ email, passwordHash, role, name, locale = 'en', googleSub = null, emailVerified = false, avatarUrl = null }) => {
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, role, name, locale, google_sub, email_verified, avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [email, passwordHash, role, name, locale, googleSub, emailVerified, avatarUrl]
    );
    return rows[0];
  },
  touchLogin: (id) => query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [id]),
  softDelete: (id) => query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [id]),
  restore: (id) => query(`UPDATE users SET deleted_at = NULL WHERE id = $1`, [id]),
};

// --------- clubs ---------
const clubs = {
  create: async ({ name, slug, city, country, primaryUserId, metadata = {} }) => {
    const { rows } = await query(
      `INSERT INTO clubs (name, slug, city, country, primary_user_id, status, metadata)
       VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING *`,
      [name, slug, city, country, primaryUserId, metadata]
    );
    return rows[0];
  },
  findById: async (id) => (await query(`SELECT * FROM clubs WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  findBySlug: async (slug) => (await query(`SELECT * FROM clubs WHERE slug=$1 AND ${ACTIVE}`, [slug])).rows[0],
  listForUser: async (userId) => (await query(
    `SELECT c.* FROM clubs c
     LEFT JOIN club_members m ON m.club_id = c.id
     WHERE c.${ACTIVE} AND (c.primary_user_id = $1 OR m.user_id = $1)
     GROUP BY c.id ORDER BY c.created_at DESC`, [userId])).rows,
  listAll: async ({ status, q, limit = 50, offset = 0 } = {}) => {
    const where = [`${ACTIVE}`]; const args = [];
    if (status) { args.push(status); where.push(`status = $${args.length}`); }
    if (q) { args.push(`%${q}%`); where.push(`(name ILIKE $${args.length} OR slug ILIKE $${args.length})`); }
    args.push(limit); args.push(offset);
    const sql = `SELECT * FROM clubs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`;
    return (await query(sql, args)).rows;
  },
  update: async (id, patch) => {
    const fields = []; const args = [];
    for (const [k, v] of Object.entries(patch)) {
      args.push(v);
      fields.push(`${k} = $${args.length}`);
    }
    if (!fields.length) return clubs.findById(id);
    args.push(id);
    const { rows } = await query(`UPDATE clubs SET ${fields.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
    return rows[0];
  },
  addMember: (clubId, userId, role = 'manager') =>
    query(`INSERT INTO club_members (club_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [clubId, userId, role]),
  softDelete: (id) => query(`UPDATE clubs SET deleted_at = NOW() WHERE id = $1`, [id]),
};

// --------- profiles ---------
const profiles = {
  findById: async (id) => (await query(`SELECT * FROM profiles WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  findByUserId: async (userId) => (await query(`SELECT * FROM profiles WHERE user_id=$1 AND ${ACTIVE}`, [userId])).rows[0],
  upsertForUser: async (userId, p) => {
    const { rows } = await query(
      `INSERT INTO profiles (user_id, club_id, first_name, last_name, date_of_birth, gender, nationality,
                             discipline, weight_kg, weight_class, record_wins, record_losses, record_draws, bio, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (user_id) DO UPDATE SET
         club_id=EXCLUDED.club_id, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
         date_of_birth=EXCLUDED.date_of_birth, gender=EXCLUDED.gender, nationality=EXCLUDED.nationality,
         discipline=EXCLUDED.discipline, weight_kg=EXCLUDED.weight_kg, weight_class=EXCLUDED.weight_class,
         record_wins=EXCLUDED.record_wins, record_losses=EXCLUDED.record_losses, record_draws=EXCLUDED.record_draws,
         bio=EXCLUDED.bio, metadata=EXCLUDED.metadata, updated_at=NOW()
       RETURNING *`,
      [userId, p.clubId || null, p.firstName, p.lastName, p.dateOfBirth || null, p.gender || null,
       p.nationality || null, p.discipline || null, p.weightKg || null, p.weightClass || null,
       p.recordWins || 0, p.recordLosses || 0, p.recordDraws || 0, p.bio || null, p.metadata || {}]
    );
    return rows[0];
  },
};

// --------- tournaments ---------
const tournaments = {
  listPublic: async () => (await query(`SELECT * FROM tournaments WHERE is_public = TRUE AND ${ACTIVE} ORDER BY starts_on DESC`)).rows,
  findById: async (id) => (await query(`SELECT * FROM tournaments WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
};

// --------- applications ---------
const applications = {
  create: async ({ profileId, tournamentId, clubId, submittedBy, formData = {} }) => {
    const { rows } = await query(
      `INSERT INTO applications (profile_id, tournament_id, club_id, submitted_by, form_data)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [profileId, tournamentId, clubId, submittedBy, formData]
    );
    return rows[0];
  },
  findById: async (id) => (await query(`SELECT * FROM applications WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  findFullById: async (id) => (await query(
    `SELECT a.*, p.first_name, p.last_name, p.weight_class, p.weight_kg, p.discipline,
            c.name AS club_name, c.slug AS club_slug, t.name AS tournament_name, t.slug AS tournament_slug
     FROM applications a
     JOIN profiles p ON p.id = a.profile_id
     LEFT JOIN clubs c ON c.id = a.club_id
     JOIN tournaments t ON t.id = a.tournament_id
     WHERE a.id = $1 AND a.${ACTIVE}`, [id])).rows[0],
  updateForm: async (id, formData) =>
    (await query(`UPDATE applications SET form_data = $1 WHERE id = $2 AND ${ACTIVE} RETURNING *`, [formData, id])).rows[0],
  setStatus: async (id, patch) => {
    const fields = []; const args = [];
    for (const [k, v] of Object.entries(patch)) { args.push(v); fields.push(`${k} = $${args.length}`); }
    args.push(id);
    const { rows } = await query(
      `UPDATE applications SET ${fields.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
    return rows[0];
  },
  query: async ({ status, tournamentId, clubId, reviewerId, q, limit = 50, offset = 0 } = {}) => {
    const where = [`a.${ACTIVE}`]; const args = [];
    if (status && status !== 'all') { args.push(status); where.push(`a.status = $${args.length}`); }
    if (tournamentId) { args.push(tournamentId); where.push(`a.tournament_id = $${args.length}`); }
    if (clubId) { args.push(clubId); where.push(`a.club_id = $${args.length}`); }
    if (reviewerId) { args.push(reviewerId); where.push(`a.reviewer_id = $${args.length}`); }
    if (q) { args.push(`%${q}%`); where.push(`(p.first_name ILIKE $${args.length} OR p.last_name ILIKE $${args.length} OR c.name ILIKE $${args.length})`); }
    args.push(limit); args.push(offset);
    const sql = `
      SELECT a.id, a.status, a.submitted_at, a.review_due_at, a.correction_due_at, a.updated_at,
             a.reviewer_id, a.tournament_id, a.club_id, a.profile_id,
             p.first_name, p.last_name, p.weight_class, p.weight_kg, p.discipline,
             c.name AS club_name, c.slug AS club_slug,
             t.name AS tournament_name
      FROM applications a
      JOIN profiles p ON p.id = a.profile_id
      LEFT JOIN clubs c ON c.id = a.club_id
      JOIN tournaments t ON t.id = a.tournament_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.updated_at DESC
      LIMIT $${args.length - 1} OFFSET $${args.length}`;
    return (await query(sql, args)).rows;
  },
  counts: async () => {
    const { rows } = await query(
      `SELECT status, COUNT(*)::int AS n FROM applications WHERE ${ACTIVE} GROUP BY status`
    );
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  },
  publicApproved: async (limit = 100) => (await query(
    `SELECT a.id, p.first_name, p.last_name, p.weight_class, p.discipline,
            c.name AS club_name, t.slug AS tournament_slug
     FROM applications a
     JOIN profiles p ON p.id = a.profile_id
     LEFT JOIN clubs c ON c.id = a.club_id
     JOIN tournaments t ON t.id = a.tournament_id
     WHERE a.status = 'approved' AND a.${ACTIVE}
     ORDER BY a.decided_at DESC LIMIT $1`, [limit])).rows,
};

// --------- status events ---------
const statusEvents = {
  add: ({ applicationId, fromStatus, toStatus, reason, metadata = {}, actorUserId, actorRole }) =>
    query(
      `INSERT INTO status_events (application_id, from_status, to_status, reason, metadata, actor_user_id, actor_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [applicationId, fromStatus || null, toStatus, reason || null, metadata, actorUserId || null, actorRole || null]
    ),
  listForApplication: async (applicationId) => (await query(
    `SELECT * FROM status_events WHERE application_id = $1 ORDER BY created_at ASC`, [applicationId])).rows,
};

// --------- appeals ---------
const appeals = {
  create: async ({ applicationId, filedBy, reason }) =>
    (await query(`INSERT INTO appeals (application_id, filed_by, reason) VALUES ($1,$2,$3) RETURNING *`,
      [applicationId, filedBy, reason])).rows[0],
  findById: async (id) => (await query(`SELECT * FROM appeals WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  listForApplication: async (applicationId) => (await query(
    `SELECT * FROM appeals WHERE application_id=$1 AND ${ACTIVE} ORDER BY created_at DESC`, [applicationId])).rows,
  listOpen: async () => (await query(
    `SELECT a.*, app.profile_id FROM appeals a JOIN applications app ON app.id = a.application_id
     WHERE a.${ACTIVE} AND a.status IN ('submitted','under_review') ORDER BY a.created_at DESC`)).rows,
  decide: async (id, { status, panelDecision, decidedBy }) =>
    (await query(
      `UPDATE appeals SET status=$1, panel_decision=$2, decided_by=$3, decided_at=NOW() WHERE id=$4 RETURNING *`,
      [status, panelDecision, decidedBy, id])).rows[0],
};

// --------- reviewers ---------
const reviewers = {
  /** Pick reviewer with the fewest open items for auto-assign. */
  leastLoaded: async () => (await query(
    `SELECT u.id, u.name, COALESCE(n.open, 0)::int AS open_count
     FROM users u
     LEFT JOIN (
       SELECT reviewer_id, COUNT(*) AS open FROM applications
       WHERE reviewer_id IS NOT NULL AND status IN ('submitted','under_review') AND deleted_at IS NULL
       GROUP BY reviewer_id
     ) n ON n.reviewer_id = u.id
     WHERE u.role = 'reviewer' AND u.deleted_at IS NULL
     ORDER BY open_count ASC, u.created_at ASC LIMIT 1`)).rows[0],
};

module.exports = { users, clubs, profiles, tournaments, applications, statusEvents, appeals, reviewers };

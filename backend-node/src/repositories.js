// Thin data access layer (Postgres). No business rules here.
// Each repo is a set of composable pure functions taking a client or using pool.

const { query } = require('./db');
const { STATUS } = require('./statusMachine');

const ACTIVE = 'deleted_at IS NULL';

// --------- users ---------
const users = {
  findByEmail: async (email) => (await query(`SELECT * FROM users WHERE email=$1 AND ${ACTIVE}`, [email])).rows[0],
  findById: async (id) => (await query(`SELECT * FROM users WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  findByGoogleSub: async (sub) => (await query(`SELECT * FROM users WHERE google_sub=$1 AND ${ACTIVE}`, [sub])).rows[0],
  list: async ({ role, q, limit = 50, offset = 0 } = {}) => {
    const where = [`${ACTIVE}`]; const args = [];
    if (role) { args.push(role); where.push(`role = $${args.length}`); }
    if (q) { args.push(`%${q}%`); where.push(`(name ILIKE $${args.length} OR email ILIKE $${args.length})`); }
    args.push(limit); args.push(offset);
    const sql = `SELECT * FROM users WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`;
    return (await query(sql, args)).rows;
  },
  create: async ({ email, passwordHash, role, name, locale = 'en', googleSub = null, emailVerified = false, avatarUrl = null }) => {
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, role, name, locale, google_sub, email_verified, avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [email, passwordHash, role, name, locale, googleSub, emailVerified, avatarUrl]
    );
    return rows[0];
  },
  touchLogin: (id) => query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [id]),
  updatePhone: async (id, phone) =>
    (await query(`UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2 AND ${ACTIVE} RETURNING *`, [phone, id])).rows[0],
  updatePassword: async (id, passwordHash) =>
    (await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [passwordHash, id])).rows[0],
  updateNotificationPreferences: async (id, prefs) =>
    (await query(`UPDATE users SET notification_preferences = $1 WHERE id = $2 RETURNING *`, [prefs, id])).rows[0],
  softDelete: (id) => query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [id]),
  restore: (id) => query(`UPDATE users SET deleted_at = NULL WHERE id = $1`, [id]),
};

// --------- sessions ---------
const sessions = {
  create: async ({ userId, refreshJti, userAgent = null, ip = null, expiresAt }) =>
    (await query(
      `INSERT INTO sessions (user_id, refresh_jti, user_agent, ip, expires_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, refreshJti, userAgent, ip, expiresAt]
    )).rows[0],
  findByJti: async (jti) =>
    (await query(`SELECT * FROM sessions WHERE refresh_jti = $1 LIMIT 1`, [jti])).rows[0],
  revokeByJti: (jti) =>
    query(`UPDATE sessions SET revoked_at = NOW() WHERE refresh_jti = $1 AND revoked_at IS NULL`, [jti]),
  revokeForUser: (userId) =>
    query(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]),
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
  restore: async (id) => (await query(`UPDATE clubs SET deleted_at = NULL WHERE id = $1 RETURNING *`, [id])).rows[0],
  listDeleted: async ({ limit = 50, offset = 0 } = {}) =>
    (await query(`SELECT * FROM clubs WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT $1 OFFSET $2`, [limit, offset])).rows,
};

// --------- profiles ---------
const profiles = {
  findById: async (id) => (await query(`SELECT * FROM profiles WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  findByUserId: async (userId) => (await query(`SELECT * FROM profiles WHERE user_id=$1 AND ${ACTIVE}`, [userId])).rows[0],
  listByClub: async (clubId, { q, limit = 100, offset = 0 } = {}) => {
    const args = [clubId];
    const where = [`p.club_id = $1`, `p.${ACTIVE}`];
    if (q) {
      args.push(`%${q}%`);
      where.push(`(p.first_name ILIKE $${args.length} OR p.last_name ILIKE $${args.length} OR u.email ILIKE $${args.length})`);
    }
    args.push(limit);
    args.push(offset);
    const sql = `
      SELECT p.*, u.email, u.phone, u.role
      FROM profiles p
      JOIN users u ON u.id = p.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.created_at DESC
      LIMIT $${args.length - 1} OFFSET $${args.length}`;
    return (await query(sql, args)).rows;
  },
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
  findLatestApprovedByUser: async (userId, { tournamentId = null } = {}) => {
    const args = [userId];
    const where = [`p.user_id = $1`, `a.status = 'approved'`, `a.deleted_at IS NULL`, `p.deleted_at IS NULL`];
    if (tournamentId) {
      args.push(tournamentId);
      where.push(`a.tournament_id = $${args.length}`);
    }
    const { rows } = await query(
      `SELECT DISTINCT ON (p.id)
        p.*, u.email, u.phone, u.role,
        a.id AS application_id,
        a.tournament_id,
        t.name AS tournament_name,
        a.decided_at
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       JOIN applications a ON a.profile_id = p.id
       JOIN tournaments t ON t.id = a.tournament_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.id, a.decided_at DESC NULLS LAST, a.created_at DESC`,
      args
    );
    return rows[0];
  },
  listForAdminReweigh: async ({ clubId, tournamentId, q, limit = 200, offset = 0 } = {}) => {
    const args = [];
    const where = [`p.${ACTIVE}`, `a.status = 'approved'`, `a.deleted_at IS NULL`];
    if (tournamentId) {
      args.push(tournamentId);
      where.push(`a.tournament_id = $${args.length}`);
    }
    if (clubId) {
      args.push(clubId);
      where.push(`p.club_id = $${args.length}`);
    }
    if (q) {
      args.push(`%${q}%`);
      where.push(`(p.first_name ILIKE $${args.length} OR p.last_name ILIKE $${args.length} OR u.email ILIKE $${args.length} OR COALESCE(c.name, '') ILIKE $${args.length})`);
    }
    args.push(limit);
    args.push(offset);
    const sql = `
      SELECT DISTINCT ON (p.id)
        p.*, u.email, c.name AS club_name,
        a.tournament_id, t.name AS tournament_name, a.decided_at
      FROM profiles p
      JOIN users u ON u.id = p.user_id
      JOIN applications a ON a.profile_id = p.id
      JOIN tournaments t ON t.id = a.tournament_id
      LEFT JOIN clubs c ON c.id = p.club_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.id, a.decided_at DESC NULLS LAST, a.created_at DESC
      LIMIT $${args.length - 1} OFFSET $${args.length}`;
    return (await query(sql, args)).rows;
  },
  updateWeightByProfileId: async (profileId, { weightKg, weightClass }) => {
    const { rows } = await query(
      `UPDATE profiles
       SET weight_kg = $1,
           weight_class = $2,
           updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [weightKg, weightClass, profileId]
    );
    return rows[0];
  },
};

// --------- tournaments ---------
const tournaments = {
  listPublic: async () => (await query(`SELECT * FROM tournaments WHERE is_public = TRUE AND ${ACTIVE} ORDER BY starts_on DESC`)).rows,
  findById: async (id) => (await query(`SELECT * FROM tournaments WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  findByIdAny: async (id) => (await query(`SELECT * FROM tournaments WHERE id=$1`, [id])).rows[0],
  createAdmin: async ({ slug, name, season = null, startsOn = null, endsOn = null, registrationOpenAt = null, registrationCloseAt = null, correctionWindowHours = null, isPublic = true }) => {
    const { rows } = await query(
      `INSERT INTO tournaments (slug, name, season, starts_on, ends_on, registration_open_at, registration_close_at, correction_window_hours, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [slug, name, season, startsOn, endsOn, registrationOpenAt, registrationCloseAt, correctionWindowHours, isPublic]
    );
    return rows[0];
  },
  listAdmin: async ({ q, includeArchived = false, limit = 200, offset = 0 } = {}) => {
    const where = includeArchived ? ['1=1'] : [`${ACTIVE}`];
    const args = [];
    if (q) {
      args.push(`%${q}%`);
      where.push(`(name ILIKE $${args.length} OR slug ILIKE $${args.length} OR COALESCE(season, '') ILIKE $${args.length})`);
    }
    args.push(limit);
    args.push(offset);
    const sql = `SELECT * FROM tournaments WHERE ${where.join(' AND ')} ORDER BY starts_on DESC NULLS LAST, created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`;
    return (await query(sql, args)).rows;
  },
  updateAdmin: async (id, patch) => {
    const map = {
      name: 'name',
      slug: 'slug',
      season: 'season',
      registrationOpenAt: 'registration_open_at',
      registrationCloseAt: 'registration_close_at',
      correctionWindowHours: 'correction_window_hours',
      startsOn: 'starts_on',
      endsOn: 'ends_on',
      isPublic: 'is_public',
    };
    const fields = [];
    const args = [];
    for (const [key, value] of Object.entries(patch || {})) {
      if (!(key in map)) continue;
      args.push(value);
      fields.push(`${map[key]} = $${args.length}`);
    }
    if (!fields.length) return tournaments.findById(id);
    args.push(id);
    const sql = `UPDATE tournaments SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${args.length} RETURNING *`;
    return (await query(sql, args)).rows[0];
  },
  softDelete: async (id) => (await query(`UPDATE tournaments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [id])).rows[0],
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
  findByProfileAndTournament: async (profileId, tournamentId) => (await query(
    `SELECT * FROM applications WHERE profile_id = $1 AND tournament_id = $2 AND ${ACTIVE} ORDER BY created_at DESC LIMIT 1`,
    [profileId, tournamentId]
  )).rows[0],
  findFullById: async (id) => (await query(
      `SELECT a.*, p.user_id, p.first_name, p.last_name, p.date_of_birth, p.gender, p.nationality,
        p.weight_class, p.weight_kg, p.discipline, p.record_wins, p.record_losses, p.record_draws,
        p.bio, p.metadata,
        u.email, u.phone,
        c.name AS club_name, c.slug AS club_slug, t.name AS tournament_name, t.slug AS tournament_slug
     FROM applications a
     JOIN profiles p ON p.id = a.profile_id
       JOIN users u ON u.id = p.user_id
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
  closeUnfinishedForOtherTournaments: async ({ activeTournamentId, actorUserId }) => {
    const statuses = [STATUS.DRAFT, STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.NEEDS_CORRECTION];
    const { rows } = await query(
      `WITH prior AS (
         SELECT id, status
         FROM applications
         WHERE deleted_at IS NULL
           AND tournament_id <> $2
           AND status = ANY($4::text[])
       )
       UPDATE applications
       SET status = $1,
           correction_due_at = NULL,
           review_due_at = NULL,
           updated_at = NOW(),
           decided_at = COALESCE(decided_at, NOW()),
           reopen_reason = NULL,
           rejection_reason = COALESCE(rejection_reason, 'Season closed'),
           form_data = COALESCE(form_data, '{}'::jsonb) || jsonb_build_object(
             'seasonClosure',
             jsonb_build_object(
               'closedAt', NOW(),
               'closedBy', $3,
               'reason', 'Season rollover'
             )
           )
       FROM prior
       WHERE applications.id = prior.id
       RETURNING applications.*, prior.status AS previous_status`,
      [STATUS.SEASON_CLOSED, activeTournamentId, actorUserId || null, statuses]
    );
    return rows;
  },
  query: async (filters = {}) => {
    const { status, tournamentId, clubId, reviewerId, overdue, dueSoon, q, limit = 50, offset = 0 } = filters;
    const where = [`a.${ACTIVE}`]; const args = [];
    if (status && status !== 'all') { args.push(status); where.push(`a.status = $${args.length}`); }
    if (tournamentId) { args.push(tournamentId); where.push(`a.tournament_id = $${args.length}`); }
    if (clubId) { args.push(clubId); where.push(`a.club_id = $${args.length}`); }
    if (reviewerId) { args.push(reviewerId); where.push(`a.reviewer_id = $${args.length}`); }
    if (overdue === true) where.push(`a.review_due_at < NOW() AND a.status IN ('submitted','under_review')`);
    if (dueSoon === true) where.push(`a.review_due_at BETWEEN NOW() AND NOW() + INTERVAL '6 hours' AND a.status IN ('submitted','under_review')`);
    if (q) {
      args.push(`%${q}%`);
      where.push(`(a.id::text ILIKE $${args.length} OR p.first_name ILIKE $${args.length} OR p.last_name ILIKE $${args.length} OR c.name ILIKE $${args.length})`);
    }
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
  softDelete: (id) => query(`UPDATE applications SET deleted_at = NOW() WHERE id = $1`, [id]),
  restore: (id) => query(`UPDATE applications SET deleted_at = NULL WHERE id = $1 RETURNING *`, [id]),
  listDeleted: async ({ limit = 50, offset = 0 } = {}) =>
    (await query(
      `SELECT a.id, a.status, a.deleted_at, p.first_name, p.last_name, t.name AS tournament_name
       FROM applications a
       JOIN profiles p ON p.id = a.profile_id
       JOIN tournaments t ON t.id = a.tournament_id
       WHERE a.deleted_at IS NOT NULL
       ORDER BY a.deleted_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )).rows,
  publicApproved: async ({ limit = 100, tournamentSlug = null } = {}) => {
    const args = [];
    const where = [`a.status = 'approved'`, `a.${ACTIVE}`];
    if (tournamentSlug) { args.push(tournamentSlug); where.push(`t.slug = $${args.length}`); }
    args.push(limit);
    return (await query(
    `SELECT a.id, p.first_name, p.last_name, p.weight_class, p.discipline,
            c.name AS club_name, t.slug AS tournament_slug
     FROM applications a
     JOIN profiles p ON p.id = a.profile_id
     LEFT JOIN clubs c ON c.id = a.club_id
     JOIN tournaments t ON t.id = a.tournament_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.decided_at DESC LIMIT $${args.length}`, args)).rows;
  },
};

// --------- documents ---------
const documents = {
  create: async ({ applicationId = null, profileId = null, kind, label = null, mimeType = null, sizeBytes = null, storageKey, checksumSha256 = null, uploadedBy = null, expiresOn = null, originalFilename = null, capturedVia = null, idNumberLast4 = null }) =>
    (await query(
      `INSERT INTO documents (application_id, profile_id, kind, label, mime_type, size_bytes, storage_key, checksum_sha256, uploaded_by, expires_on, original_filename, captured_via, id_number_last4)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [applicationId, profileId, kind, label, mimeType, sizeBytes, storageKey, checksumSha256, uploadedBy, expiresOn, originalFilename, capturedVia, idNumberLast4]
    )).rows[0],
  listForApplication: async (applicationId) =>
    (await query(`SELECT * FROM documents WHERE application_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [applicationId])).rows,
  findById: async (id) =>
    (await query(`SELECT * FROM documents WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0],
  setVerification: async (id, { verifiedBy, verifyReason = null, verified }) =>
    (await query(
      `UPDATE documents
         SET verified_at = CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
             verified_by = $2,
             verify_reason = $4,
             updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, verifiedBy, verified, verifyReason]
    )).rows[0],
};

const trash = {
  list: async ({ entity, limit = 100, offset = 0 }) => {
    const map = {
      users: `SELECT 'users' AS entity, id::text AS id, email AS label, deleted_at FROM users WHERE deleted_at IS NOT NULL`,
      clubs: `SELECT 'clubs' AS entity, id::text AS id, name AS label, deleted_at FROM clubs WHERE deleted_at IS NOT NULL`,
      profiles: `SELECT 'profiles' AS entity, id::text AS id, first_name || ' ' || last_name AS label, deleted_at FROM profiles WHERE deleted_at IS NOT NULL`,
      applications: `SELECT 'applications' AS entity, id::text AS id, id::text AS label, deleted_at FROM applications WHERE deleted_at IS NOT NULL`,
      tournaments: `SELECT 'tournaments' AS entity, id::text AS id, name AS label, deleted_at FROM tournaments WHERE deleted_at IS NOT NULL`,
      appeals: `SELECT 'appeals' AS entity, id::text AS id, id::text AS label, deleted_at FROM appeals WHERE deleted_at IS NOT NULL`,
    };
    if (entity && map[entity]) {
      return (await query(`${map[entity]} ORDER BY deleted_at DESC LIMIT $1 OFFSET $2`, [limit, offset])).rows;
    }
    const union = Object.values(map).join(' UNION ALL ');
    return (await query(`${union} ORDER BY deleted_at DESC LIMIT $1 OFFSET $2`, [limit, offset])).rows;
  },
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

// --------- circulars ---------
const circulars = {
  create: async ({ title, subtitle = null, kind = 'notice', body = '', coverImageUrl = null, ctaLabel = null, ctaUrl = null, isPublished = false, publishedAt = null, showFrom = null, showUntil = null, pinned = false, createdBy = null }) => {
    const { rows } = await query(
      `INSERT INTO circulars (title, subtitle, kind, body, cover_image_url, cta_label, cta_url, is_published, published_at, show_from, show_until, pinned, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [title, subtitle, kind, body, coverImageUrl, ctaLabel, ctaUrl, isPublished, publishedAt, showFrom, showUntil, pinned, createdBy]
    );
    return rows[0];
  },
  findById: async (id) => (await query(`SELECT * FROM circulars WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  listAdmin: async ({ q, published, kind, limit = 50, offset = 0 } = {}) => {
    const where = [`${ACTIVE}`]; const args = [];
    if (published === true) where.push(`is_published = TRUE`);
    if (published === false) where.push(`is_published = FALSE`);
    if (kind) { args.push(kind); where.push(`kind = $${args.length}`); }
    if (q) { args.push(`%${q}%`); where.push(`(title ILIKE $${args.length} OR subtitle ILIKE $${args.length} OR body ILIKE $${args.length})`); }
    args.push(limit); args.push(offset);
    const sql = `SELECT * FROM circulars WHERE ${where.join(' AND ')}
                 ORDER BY pinned DESC, COALESCE(published_at, created_at) DESC
                 LIMIT $${args.length - 1} OFFSET $${args.length}`;
    return (await query(sql, args)).rows;
  },
  listPublic: async ({ kind, limit = 20 } = {}) => {
    const where = [
      `${ACTIVE}`,
      `is_published = TRUE`,
      `(show_from IS NULL OR show_from <= NOW())`,
      `(show_until IS NULL OR show_until >= NOW())`,
    ];
    const args = [];
    if (kind) { args.push(kind); where.push(`kind = $${args.length}`); }
    args.push(limit);
    const sql = `SELECT id, title, subtitle, kind, body, cover_image_url, cta_label, cta_url,
                        published_at, show_from, show_until, pinned
                 FROM circulars
                 WHERE ${where.join(' AND ')}
                 ORDER BY pinned DESC, COALESCE(published_at, created_at) DESC
                 LIMIT $${args.length}`;
    return (await query(sql, args)).rows;
  },
  update: async (id, patch) => {
    const fields = []; const args = [];
    const map = {
      title: 'title',
      subtitle: 'subtitle',
      kind: 'kind',
      body: 'body',
      coverImageUrl: 'cover_image_url',
      ctaLabel: 'cta_label',
      ctaUrl: 'cta_url',
      isPublished: 'is_published',
      publishedAt: 'published_at',
      showFrom: 'show_from',
      showUntil: 'show_until',
      pinned: 'pinned',
    };
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in map)) continue;
      args.push(v);
      fields.push(`${map[k]} = $${args.length}`);
    }
    if (!fields.length) return circulars.findById(id);
    args.push(id);
    const { rows } = await query(`UPDATE circulars SET ${fields.join(', ')} WHERE id = $${args.length} RETURNING *`, args);
    return rows[0];
  },
  softDelete: (id) => query(`UPDATE circulars SET deleted_at = NOW() WHERE id = $1`, [id]),
};

// --------- appeals ---------
const appeals = {
  create: async ({ applicationId, filedBy, reason }) =>
    (await query(`INSERT INTO appeals (application_id, filed_by, reason) VALUES ($1,$2,$3) RETURNING *`,
      [applicationId, filedBy, reason])).rows[0],
  findById: async (id) => (await query(`SELECT * FROM appeals WHERE id=$1 AND ${ACTIVE}`, [id])).rows[0],
  listForUser: async (userId) => (await query(
    `SELECT a.* FROM appeals a
     JOIN applications app ON app.id = a.application_id
     WHERE a.${ACTIVE} AND app.submitted_by = $1
     ORDER BY a.created_at DESC`,
    [userId]
  )).rows,
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

module.exports = { users, sessions, clubs, profiles, tournaments, applications, documents, statusEvents, appeals, reviewers, circulars, trash };

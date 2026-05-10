// Tamper-evident audit log service.
// Each row's hash = sha256(prev_hash || canonical(payload)).
// Works for read-heavy export; low contention expected.

const crypto = require('crypto');
const { query, transaction } = require('./db');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj || {}).sort());
}

async function write({ actorUserId = null, actorRole = null, action, entityType, entityId, payload = {}, requestIp = null }) {
  const normalizedActorUserId = (typeof actorUserId === 'string' && UUID_RE.test(actorUserId)) ? actorUserId : null;
  return transaction(async (c) => {
    const { rows: last } = await c.query('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
    const prevHash = last[0]?.hash || '';
    const body = canonical({ action, entityType, entityId, payload, at: new Date().toISOString(), actorUserId: normalizedActorUserId, actorRole });
    const hash = crypto.createHash('sha256').update(prevHash).update(body).digest('hex');
    await c.query(
      `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, payload, request_ip, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [normalizedActorUserId, actorRole, action, entityType, String(entityId), payload, requestIp, prevHash || null, hash]
    );
    return { hash };
  });
}

async function verifyChain({ limit = 10000 } = {}) {
  const { rows } = await query(
    `SELECT id, actor_user_id, actor_role, action, entity_type, entity_id, payload, prev_hash, hash, occurred_at
     FROM audit_log ORDER BY id ASC LIMIT $1`, [limit]);
  let prev = '';
  for (const r of rows) {
    const body = canonical({
      action: r.action, entityType: r.entity_type, entityId: r.entity_id,
      payload: r.payload, at: r.occurred_at.toISOString?.() || r.occurred_at,
      actorUserId: r.actor_user_id, actorRole: r.actor_role,
    });
    const expected = crypto.createHash('sha256').update(prev).update(body).digest('hex');
    if (expected !== r.hash) return { ok: false, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}

async function listForEntity(entityType, entityId, limit = 200) {
  const { rows } = await query(
    `SELECT id, occurred_at, actor_user_id, actor_role, action, payload, hash
     FROM audit_log WHERE entity_type = $1 AND entity_id = $2
     ORDER BY id DESC LIMIT $3`,
    [entityType, String(entityId), limit]
  );
  return rows;
}

async function listRecent({ limit = 50, beforeId = null, action = null, entityType = null, actorUserId = null, since = null, until = null } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const where = [];
  const params = [];
  if (beforeId) { params.push(Number(beforeId)); where.push(`id < $${params.length}`); }
  if (action) { params.push(String(action)); where.push(`action = $${params.length}`); }
  if (entityType) { params.push(String(entityType)); where.push(`entity_type = $${params.length}`); }
  if (actorUserId && UUID_RE.test(actorUserId)) { params.push(actorUserId); where.push(`actor_user_id = $${params.length}`); }
  if (since) { params.push(since); where.push(`occurred_at >= $${params.length}`); }
  if (until) { params.push(until); where.push(`occurred_at < $${params.length}`); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(lim);
  const { rows } = await query(
    `SELECT a.id, a.occurred_at, a.actor_user_id, a.actor_role, a.action, a.entity_type, a.entity_id,
            a.payload, a.request_ip, u.email AS actor_email, u.name AS actor_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${whereClause}
     ORDER BY a.id DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function summary() {
  const { rows: actionRows } = await query(
    `SELECT action, COUNT(*)::int AS count
     FROM audit_log
     WHERE occurred_at > NOW() - INTERVAL '7 days'
     GROUP BY action ORDER BY count DESC LIMIT 20`
  );
  const { rows: totalRows } = await query(`SELECT COUNT(*)::bigint AS total FROM audit_log`);
  const { rows: latestRows } = await query(`SELECT occurred_at FROM audit_log ORDER BY id DESC LIMIT 1`);
  return {
    total: Number(totalRows[0]?.total || 0),
    latestAt: latestRows[0]?.occurred_at || null,
    last7Days: actionRows,
  };
}

module.exports = { write, verifyChain, listForEntity, listRecent, summary };

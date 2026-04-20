const { circulars: circularsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');

function normalizeCircular(row) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    kind: row.kind,
    body: row.body,
    coverImageUrl: row.cover_image_url,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    showFrom: row.show_from,
    showUntil: row.show_until,
    pinned: row.pinned,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listPublic(query = {}) {
  const rows = await circularsRepo.listPublic(query);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    kind: r.kind,
    body: r.body,
    coverImageUrl: r.cover_image_url,
    ctaLabel: r.cta_label,
    ctaUrl: r.cta_url,
    publishedAt: r.published_at,
    showFrom: r.show_from,
    showUntil: r.show_until,
    pinned: r.pinned,
  }));
}

async function listAdmin(user, query = {}) {
  if (user.role !== 'admin') throw ApiError.forbidden();
  const published =
    query.published === 'true' ? true : query.published === 'false' ? false : undefined;
  const rows = await circularsRepo.listAdmin({
    q: query.q,
    kind: query.kind,
    published,
    limit: query.limit,
    offset: query.offset,
  });
  return rows.map(normalizeCircular);
}

async function create(user, data, ctx = {}) {
  if (user.role !== 'admin') throw ApiError.forbidden();
  const now = new Date();
  const isPublished = !!data.isPublished;
  const publishedAt = isPublished ? (data.publishedAt ? new Date(data.publishedAt) : now) : null;
  const created = await circularsRepo.create({
    title: data.title,
    subtitle: data.subtitle || null,
    kind: data.kind,
    body: data.body || '',
    coverImageUrl: data.coverImageUrl || null,
    ctaLabel: data.ctaLabel || null,
    ctaUrl: data.ctaUrl || null,
    isPublished,
    publishedAt,
    showFrom: data.showFrom ? new Date(data.showFrom) : null,
    showUntil: data.showUntil ? new Date(data.showUntil) : null,
    pinned: !!data.pinned,
    createdBy: user.id,
  });
  await auditWrite({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'circular.create',
    entityType: 'circular',
    entityId: created.id,
    payload: { title: data.title, kind: data.kind, isPublished },
    requestIp: ctx.ip,
  });
  return normalizeCircular(created);
}

async function update(user, id, patch, ctx = {}) {
  if (user.role !== 'admin') throw ApiError.forbidden();
  const existing = await circularsRepo.findById(id);
  if (!existing) throw ApiError.notFound('Circular not found');

  const outPatch = { ...patch };
  if (typeof outPatch.isPublished === 'boolean') {
    if (outPatch.isPublished) {
      if (!outPatch.publishedAt) outPatch.publishedAt = new Date().toISOString();
    } else {
      outPatch.publishedAt = null;
    }
  }

  const updated = await circularsRepo.update(id, outPatch);
  await auditWrite({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'circular.update',
    entityType: 'circular',
    entityId: id,
    payload: { ...patch },
    requestIp: ctx.ip,
  });
  return normalizeCircular(updated);
}

async function remove(user, id, ctx = {}) {
  if (user.role !== 'admin') throw ApiError.forbidden();
  const existing = await circularsRepo.findById(id);
  if (!existing) throw ApiError.notFound('Circular not found');
  await circularsRepo.softDelete(id);
  await auditWrite({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'circular.delete',
    entityType: 'circular',
    entityId: id,
    payload: {},
    requestIp: ctx.ip,
  });
  return { ok: true };
}

module.exports = { listPublic, listAdmin, create, update, remove };


const { clubs: clubsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');

async function createClub(user, data, ctx = {}) {
  const existing = await clubsRepo.findBySlug(data.slug);
  if (existing) throw ApiError.conflict('Slug already taken', { field: 'slug' });
  const club = await clubsRepo.create({ ...data, primaryUserId: user.id });
  await clubsRepo.addMember(club.id, user.id, 'manager');
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'club.create',
    entityType: 'club', entityId: club.id, payload: data, requestIp: ctx.ip });
  return club;
}

async function listClubsForUser(user, query = {}) {
  if (user.role === 'admin') return clubsRepo.listAll(query);
  return clubsRepo.listForUser(user.id);
}

async function listPublicClubs(query = {}) {
  return clubsRepo.listAll({ ...query, status: 'active' });
}

async function updateClub(user, id, patch, ctx = {}) {
  const club = await clubsRepo.findById(id);
  if (!club) throw ApiError.notFound();
  // club managers can edit their own (except status); admins can edit all.
  if (user.role !== 'admin') {
    if (club.primary_user_id !== user.id) throw ApiError.forbidden();
    delete patch.status;
  }
  const updated = await clubsRepo.update(id, patch);
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'club.update',
    entityType: 'club', entityId: id, payload: patch, requestIp: ctx.ip });
  return updated;
}

async function approveClub(user, id, ctx = {}) {
  if (user.role !== 'admin') throw ApiError.forbidden();
  const updated = await clubsRepo.update(id, { status: 'active' });
  await auditWrite({ actorUserId: user.id, actorRole: 'admin', action: 'club.approve',
    entityType: 'club', entityId: id, payload: {}, requestIp: ctx.ip });
  return updated;
}

async function trashList(user, query = {}) {
  if (user.role !== 'admin') throw ApiError.forbidden();
  return clubsRepo.listDeleted(query);
}

async function softDeleteClub(user, id, ctx = {}) {
  const club = await clubsRepo.findById(id);
  if (!club) throw ApiError.notFound();
  if (user.role !== 'admin' && club.primary_user_id !== user.id) throw ApiError.forbidden();
  await clubsRepo.softDelete(id);
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'club.soft_delete',
    entityType: 'club', entityId: id, payload: {}, requestIp: ctx.ip });
  return { ok: true };
}

async function restoreClub(user, id, ctx = {}) {
  if (user.role !== 'admin') throw ApiError.forbidden();
  const restored = await clubsRepo.restore(id);
  if (!restored) throw ApiError.notFound();
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'club.restore',
    entityType: 'club', entityId: id, payload: {}, requestIp: ctx.ip });
  return restored;
}

module.exports = { createClub, listClubsForUser, listPublicClubs, updateClub, approveClub, trashList, softDeleteClub, restoreClub };

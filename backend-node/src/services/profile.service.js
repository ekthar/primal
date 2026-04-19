const { profiles: profilesRepo, clubs: clubsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');

async function upsertMyProfile(userId, data, ctx = {}) {
  if (data.clubId) {
    const c = await clubsRepo.findById(data.clubId);
    if (!c) throw ApiError.badRequest('Unknown club', { field: 'clubId' });
  }
  const profile = await profilesRepo.upsertForUser(userId, data);
  await auditWrite({ actorUserId: userId, action: 'profile.upsert', entityType: 'profile',
    entityId: profile.id, payload: { clubId: profile.club_id }, requestIp: ctx.ip });
  return profile;
}

async function getMyProfile(userId) {
  return profilesRepo.findByUserId(userId) || null;
}

async function getProfileById(id) {
  const p = await profilesRepo.findById(id);
  if (!p) throw ApiError.notFound();
  return p;
}

module.exports = { upsertMyProfile, getMyProfile, getProfileById };

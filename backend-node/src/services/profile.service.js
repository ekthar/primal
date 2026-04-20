const { profiles: profilesRepo, clubs: clubsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');
const { validateIndiaAddress } = require('../indiaLocations');

async function upsertMyProfile(userId, data, ctx = {}) {
  const payload = {
    ...data,
    nationality: 'India',
    metadata: data?.metadata && typeof data.metadata === 'object' ? { ...data.metadata } : {},
  };

  const addressValidation = validateIndiaAddress(payload.metadata.address);
  if (!addressValidation.valid) {
    throw ApiError.badRequest('Invalid India address', {
      field: addressValidation.field,
      reason: addressValidation.reason,
    });
  }
  payload.metadata.address = addressValidation.normalized;

  if (data.clubId) {
    const c = await clubsRepo.findById(data.clubId);
    if (!c) throw ApiError.badRequest('Unknown club', { field: 'clubId' });
  }
  const profile = await profilesRepo.upsertForUser(userId, payload);
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

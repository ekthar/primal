const { profiles: profilesRepo, clubs: clubsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');
const { validateIndiaAddress } = require('../indiaLocations');

const WEIGHT_CLASSES = {
  male: [
    { label: '-54 kg', max: 54 },
    { label: '-57 kg', max: 57 },
    { label: '-60 kg', max: 60 },
    { label: '-63.5 kg', max: 63.5 },
    { label: '-67 kg', max: 67 },
    { label: '-71 kg', max: 71 },
    { label: '-75 kg', max: 75 },
    { label: '-81 kg', max: 81 },
    { label: '-86 kg', max: 86 },
    { label: '-91 kg', max: 91 },
    { label: '+91 kg', max: 999 },
  ],
  female: [
    { label: '-48 kg', max: 48 },
    { label: '-52 kg', max: 52 },
    { label: '-56 kg', max: 56 },
    { label: '-60 kg', max: 60 },
    { label: '-65 kg', max: 65 },
    { label: '-70 kg', max: 70 },
    { label: '+70 kg', max: 999 },
  ],
};

function deriveWeightClass(gender, weightKg) {
  const key = String(gender || '').toLowerCase();
  const normalized = key === 'female' ? 'female' : 'male';
  const table = WEIGHT_CLASSES[normalized] || WEIGHT_CLASSES.male;
  const weight = Number(weightKg || 0);
  const hit = table.find((item) => weight <= item.max);
  return hit?.label || null;
}

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

async function listForAdminReweigh(actor, query = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  return profilesRepo.listForAdminReweigh(query);
}

async function adminReweigh(actor, profileId, { weightKg }, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const profile = await profilesRepo.findById(profileId);
  if (!profile) throw ApiError.notFound('Profile not found');
  const weightClass = deriveWeightClass(profile.gender, weightKg);
  const updated = await profilesRepo.updateWeightByProfileId(profileId, { weightKg, weightClass });
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'profile.reweigh',
    entityType: 'profile',
    entityId: profileId,
    payload: { weightKg, weightClass },
    requestIp: ctx.ip,
  });
  return updated;
}

module.exports = { upsertMyProfile, getMyProfile, getProfileById, listForAdminReweigh, adminReweigh };

const { profiles: profilesRepo, clubs: clubsRepo, users: usersRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');
const { validateIndiaAddress } = require('../indiaLocations');
const { query } = require('../db');
const bracketService = require('./bracket.service');
const { resolveAvatarUrl } = require('./avatar.service');
const { deriveOfficialWeightClass } = require('../domain/categoryRules');

function deriveWeightClass(profile, weightKg) {
  const selectedDisciplines = Array.isArray(profile?.metadata?.selectedDisciplines)
    ? profile.metadata.selectedDisciplines
    : [];
  return deriveOfficialWeightClass({
    disciplineId: selectedDisciplines[0] || profile?.discipline,
    gender: profile?.gender,
    dateOfBirth: profile?.date_of_birth,
    weightKg,
  });
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
  const phone = typeof payload.metadata.phone === 'string' ? payload.metadata.phone.trim() : '';
  payload.metadata.phone = phone || null;

  if (data.clubId) {
    const c = await clubsRepo.findById(data.clubId);
    if (!c) throw ApiError.badRequest('Unknown club', { field: 'clubId' });
  }
  const selectedDisciplines = Array.isArray(payload.metadata.selectedDisciplines)
    ? payload.metadata.selectedDisciplines
    : [];
  const derivedWeightClass = deriveOfficialWeightClass({
    disciplineId: selectedDisciplines[0] || payload.discipline,
    gender: payload.gender,
    dateOfBirth: payload.dateOfBirth,
    weightKg: payload.weightKg,
  });
  payload.weightClass = derivedWeightClass || payload.weightClass || null;
  const profile = await profilesRepo.upsertForUser(userId, payload);
  await usersRepo.updatePhone(userId, payload.metadata.phone);
  await auditWrite({ actorUserId: userId, action: 'profile.upsert', entityType: 'profile',
    entityId: profile.id, payload: { clubId: profile.club_id }, requestIp: ctx.ip });
  return profile;
}

async function getMyProfile(userId) {
  const [profile, user] = await Promise.all([
    profilesRepo.findByUserId(userId),
    usersRepo.findById(userId),
  ]);
  if (!profile) return null;
  return {
    ...profile,
    phone: user?.phone || profile.metadata?.phone || null,
    avatar_url: resolveAvatarUrl({
      explicitAvatarUrl: null,
      photoAvatarUrl: null,
      name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
      key: profile.id || userId,
      audience: 'external',
    }),
  };
}

async function getProfileById(id) {
  const p = await profilesRepo.findById(id);
  if (!p) throw ApiError.notFound();
  return {
    ...p,
    avatar_url: resolveAvatarUrl({
      explicitAvatarUrl: null,
      photoAvatarUrl: null,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      key: p.id || id,
      audience: 'internal',
    }),
  };
}

async function listForAdminReweigh(actor, query = {}) {
  if (!['admin', 'state_coordinator'].includes(actor.role)) throw ApiError.forbidden();
  const stateCode = actor.role === 'state_coordinator' ? actor.stateCode : query.stateCode;
  return profilesRepo.listForAdminReweigh({ ...query, stateCode: stateCode || null });
}

async function adminReweigh(actor, profileId, { weightKg }, ctx = {}) {
  if (!['admin', 'state_coordinator'].includes(actor.role)) throw ApiError.forbidden();
  const profile = await profilesRepo.findById(profileId);
  if (!profile) throw ApiError.notFound('Profile not found');
  if (actor.role === 'state_coordinator') {
    const profileState = String(profile.metadata?.address?.state || '').trim();
    if (!actor.stateCode || profileState !== actor.stateCode) {
      throw ApiError.forbidden();
    }
  }
  const weightClass = deriveWeightClass(profile, weightKg);
  const updated = await profilesRepo.updateWeightByProfileId(profileId, { weightKg, weightClass });
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'profile.reweigh',
    entityType: 'profile',
    entityId: profileId,
    payload: {
      previousWeightKg: profile.weight_kg,
      previousWeightClass: profile.weight_class,
      weightKg,
      weightClass,
    },
    requestIp: ctx.ip,
  });
  const { rows } = await query(
    `SELECT DISTINCT tournament_id
     FROM applications
     WHERE profile_id = $1
       AND deleted_at IS NULL
       AND status = 'approved'`,
    [profileId]
  );
  await Promise.all(rows.map((row) => bracketService.refreshSuggestedForTournament(row.tournament_id, { actorUserId: actor.id })));
  return updated;
}

module.exports = { upsertMyProfile, getMyProfile, getProfileById, listForAdminReweigh, adminReweigh };

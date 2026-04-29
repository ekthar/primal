const { clubs: clubsRepo, users: usersRepo, profiles: profilesRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');
const { hashPassword } = require('../security');
const { validateIndiaAddress } = require('../indiaLocations');
const { issuePasswordResetForUser, publicUser } = require('./auth.service');
const { randomBytes } = require('crypto');
const { customAlphabet } = require('nanoid');
const { splitPersonName } = require('./identity.service');
const { deriveOfficialWeightClass } = require('../domain/categoryRules');

const createCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10);

async function assertClubAccess(user, clubId) {
  const club = await clubsRepo.findById(clubId);
  if (!club) throw ApiError.notFound('Club not found');
  if (user.role === 'admin') return club;
  if (user.role !== 'club') throw ApiError.forbidden();
  if (club.primary_user_id !== user.id) throw ApiError.forbidden();
  return club;
}

async function createClub(user, data, ctx = {}) {
  const payload = {
    ...data,
    country: 'India',
    metadata: {
      ...(data.metadata || {}),
      clubCode: data?.metadata?.clubCode || `CLB-${createCode()}`,
    },
  };
  const existing = await clubsRepo.findBySlug(payload.slug);
  if (existing) throw ApiError.conflict('Slug already taken', { field: 'slug' });
  const club = await clubsRepo.create({ ...payload, primaryUserId: user.id });
  await clubsRepo.addMember(club.id, user.id, 'manager');
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'club.create',
    entityType: 'club', entityId: club.id, payload: payload, requestIp: ctx.ip });
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
  if (Object.prototype.hasOwnProperty.call(patch, 'country')) {
    patch.country = 'India';
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

async function listParticipants(user, clubId, query = {}) {
  await assertClubAccess(user, clubId);
  return profilesRepo.listByClub(clubId, query);
}

async function createParticipant(user, clubId, payload, ctx = {}) {
  const club = await assertClubAccess(user, clubId);
  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.fullName || '').trim();
  const { firstName, lastName } = splitPersonName(fullName);
  const addressValidation = validateIndiaAddress(payload.address);
  if (!addressValidation.valid) {
    throw ApiError.badRequest('Invalid India address', {
      field: addressValidation.field,
      reason: addressValidation.reason,
    });
  }

  let participantUser = await usersRepo.findByEmail(email);
  let createdUser = false;
  let temporaryPassword = null;
  if (!participantUser) {
    const tempPassword = randomBytes(12).toString('base64url');
    temporaryPassword = tempPassword;
    participantUser = await usersRepo.create({
      email,
      passwordHash: await hashPassword(tempPassword),
      role: 'applicant',
      name: fullName,
      locale: 'en',
    });
    createdUser = true;
  } else if (participantUser.role !== 'applicant') {
    throw ApiError.conflict('Email belongs to a non-applicant account', { field: 'email' });
  }

  const existingProfile = await profilesRepo.findByUserId(participantUser.id);
  if (existingProfile && existingProfile.club_id && existingProfile.club_id !== club.id) {
    throw ApiError.conflict('Participant already belongs to another club', { field: 'email' });
  }
  const selectedDisciplines = Array.isArray(payload.selectedDisciplines) ? payload.selectedDisciplines : [];
  const weightClass = deriveOfficialWeightClass({
    disciplineId: selectedDisciplines[0] || payload.discipline,
    gender: payload.gender,
    dateOfBirth: payload.dateOfBirth,
    weightKg: payload.weightKg,
  });

  const profile = await profilesRepo.upsertForUser(participantUser.id, {
    firstName,
    lastName,
    dateOfBirth: payload.dateOfBirth || null,
    gender: payload.gender || null,
    nationality: 'India',
    discipline: payload.discipline || null,
    weightKg: payload.weightKg || null,
    weightClass: payload.weightClass || weightClass || null,
    recordWins: existingProfile?.record_wins || 0,
    recordLosses: existingProfile?.record_losses || 0,
    recordDraws: existingProfile?.record_draws || 0,
    bio: payload.bio || null,
    clubId: club.id,
    metadata: {
      ...(existingProfile?.metadata || {}),
      phone: payload.phone || participantUser.phone || null,
      address: addressValidation.normalized,
      managedByClub: true,
      fighterCode: existingProfile?.metadata?.fighterCode || `FIG-${createCode()}`,
      selectedDisciplines,
    },
  });

  let resetUrl = null;
  if (payload.sendResetLink || createdUser) {
    const issued = await issuePasswordResetForUser(participantUser, ctx);
    resetUrl = issued.resetUrl;
  }

  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'club.participant.create',
    entityType: 'profile', entityId: profile.id, payload: { clubId: club.id, userId: participantUser.id }, requestIp: ctx.ip });

  const out = {
    user: publicUser(participantUser),
    profile,
    loginId: participantUser.email,
    fighterCode: profile?.metadata?.fighterCode || null,
  };
  if (temporaryPassword) out.temporaryPassword = temporaryPassword;
  if (resetUrl && user.role !== 'admin') out.resetUrl = resetUrl;
  return out;
}

async function updateParticipant(user, clubId, profileId, payload, ctx) {
  const club = await assertClubAccess(user, clubId);
  const existingProfile = await profilesRepo.findById(profileId);
  if (!existingProfile || existingProfile.club_id !== club.id) {
    throw ApiError.notFound('Club participant not found');
  }

  const fullName = String(payload.fullName || '').trim();
  const { firstName, lastName } = splitPersonName(fullName);
  const addressValidation = validateIndiaAddress(payload.address);
  if (!addressValidation.valid) {
    throw ApiError.badRequest('Invalid India address', {
      field: addressValidation.field,
      reason: addressValidation.reason,
    });
  }

  const participantUser = await usersRepo.findById(existingProfile.user_id);
  if (!participantUser) throw ApiError.notFound('Participant user not found');
  const selectedDisciplines = Array.isArray(payload.selectedDisciplines) ? payload.selectedDisciplines : [];
  const nextPhone = payload.phone ? payload.phone : null;
  const weightClass = deriveOfficialWeightClass({
    disciplineId: selectedDisciplines[0] || payload.discipline,
    gender: payload.gender,
    dateOfBirth: payload.dateOfBirth,
    weightKg: payload.weightKg,
  });

  const updated = await profilesRepo.upsertForUser(participantUser.id, {
    firstName,
    lastName,
    dateOfBirth: payload.dateOfBirth || null,
    gender: payload.gender || null,
    nationality: 'India',
    discipline: payload.discipline || selectedDisciplines[0] || null,
    weightKg: payload.weightKg || null,
    weightClass: payload.weightClass || weightClass || null,
    recordWins: existingProfile.record_wins || 0,
    recordLosses: existingProfile.record_losses || 0,
    recordDraws: existingProfile.record_draws || 0,
    bio: payload.bio || null,
    clubId: club.id,
    metadata: {
      ...(existingProfile.metadata || {}),
      phone: nextPhone,
      address: addressValidation.normalized,
      managedByClub: true,
      fighterCode: existingProfile?.metadata?.fighterCode || `FIG-${createCode()}`,
      selectedDisciplines,
    },
  });

  if (payload.phone !== undefined) {
    await usersRepo.updatePhone(participantUser.id, nextPhone);
  }

  await auditWrite({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'club.participant.update',
    entityType: 'profile',
    entityId: updated.id,
    payload: { clubId: club.id, userId: participantUser.id },
    requestIp: ctx.ip,
  });

  return {
    profile: {
      ...updated,
      email: participantUser.email,
      phone: nextPhone,
      role: participantUser.role,
    },
  };
}

async function issueParticipantResetLink(user, clubId, profileId, ctx = {}) {
  const club = await assertClubAccess(user, clubId);
  const profile = await profilesRepo.findById(profileId);
  if (!profile || profile.club_id !== club.id) {
    throw ApiError.notFound('Club participant not found');
  }
  const participantUser = await usersRepo.findById(profile.user_id);
  if (!participantUser) throw ApiError.notFound('Participant user not found');

  const issued = await issuePasswordResetForUser(participantUser, ctx);
  await auditWrite({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'club.participant.reset_link',
    entityType: 'profile',
    entityId: profile.id,
    payload: { clubId: club.id, userId: participantUser.id },
    requestIp: ctx.ip,
  });

  return {
    profileId: profile.id,
    loginId: participantUser.email,
    fighterCode: profile?.metadata?.fighterCode || null,
    resetUrl: issued.resetUrl,
  };
}

module.exports = {
  createClub,
  listClubsForUser,
  listPublicClubs,
  updateClub,
  approveClub,
  trashList,
  softDeleteClub,
  restoreClub,
  listParticipants,
  createParticipant,
  updateParticipant,
  issueParticipantResetLink,
};

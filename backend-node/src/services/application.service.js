const {
  applications: appsRepo, profiles: profilesRepo, tournaments: tournamentsRepo,
  statusEvents: seRepo, reviewers: reviewersRepo, clubs: clubsRepo, documents: documentsRepo,
} = require('../repositories');
const { STATUS, assertTransition } = require('../statusMachine');
const { ApiError } = require('../apiError');
const { config } = require('../config');
const { write: auditWrite } = require('../audit');
const { dispatch: notify } = require('../notifications');
const { createHash } = require('crypto');
const tournamentService = require('./tournament.service');
const documentStorage = require('./documentStorage.service');
const { resolveAvatarUrl } = require('./avatar.service');
const { formatPersonName, applicationDisplayId, reviewerDisplayId } = require('./identity.service');
const { buildOfficialCategory } = require('../domain/categoryRules');

const HOUR = 60 * 60 * 1000;
const REQUIRED_DOCUMENT_KINDS = ['medical', 'photo_id', 'consent'];

function withDisplayFields(entity) {
  return {
    ...entity,
    applicant_display_name: formatPersonName(entity.first_name, entity.last_name),
    application_display_id: applicationDisplayId(entity.id),
    reviewer_display_id: entity.reviewer_id ? reviewerDisplayId(entity.reviewer_id) : null,
  };
}

function withAvatarUrlFromDocuments(entity, documents) {
  const photoDocument = documents.find((documentRow) => documentRow.kind === 'photo_id');
  return {
    ...withDisplayFields(entity),
    avatar_url: resolveAvatarUrl({
      explicitAvatarUrl: entity.avatar_url || null,
      photoAvatarUrl: photoDocument ? documentStorage.getPublicDocumentUrl(photoDocument.storage_key) : null,
      name: formatPersonName(entity.first_name, entity.last_name),
      key: entity.profile_id || entity.id,
      audience: 'internal',
    }),
  };
}

function assertRegistrationWindowOpen(tournament, message = 'Registration window closed') {
  if (!tournamentService.getRegistrationState(tournament).registrationOpen) {
    throw ApiError.forbidden(message);
  }
}

function buildCategoryValidation(profile, formData) {
  const selectedDisciplines = Array.isArray(formData?.selectedDisciplines)
    ? formData.selectedDisciplines
    : [];
  const disciplines = selectedDisciplines.length ? selectedDisciplines : [profile.discipline].filter(Boolean);
  return disciplines.map((disciplineId) => buildOfficialCategory({
    disciplineId,
    gender: profile.gender,
    dateOfBirth: profile.date_of_birth,
    weightKg: formData?.weightKg || profile.weight_kg,
    onDate: new Date().toISOString(),
  }));
}

function assertOfficialCategories(profile, formData) {
  const categories = buildCategoryValidation(profile, formData);
  if (!categories.length) {
    throw ApiError.unprocessable('Select at least one official category discipline', {
      field: 'selectedDisciplines',
    });
  }
  const invalid = categories.filter((category) => !category.valid);
  if (invalid.length) {
    throw ApiError.unprocessable('Invalid official category selection', {
      categories: invalid.map((category) => ({
        discipline: category.discipline?.label || null,
        division: category.division?.label || null,
        issues: category.issues,
      })),
    });
  }
  return categories;
}

function isSeasonClosedSource(app, tournament) {
  if (app.status === STATUS.SEASON_CLOSED) return true;
  if (!tournament) return false;
  const state = tournamentService.getRegistrationState(tournament);
  return Boolean(tournament.deleted_at || !state.registrationOpen);
}

// ---- Authorization helpers ---------------------------------------------------
async function assertCanView(user, app) {
  if (user.role === 'admin' || user.role === 'reviewer') return;
  if (user.role === 'club') {
    if (!app.club_id) throw ApiError.forbidden();
    const club = await clubsRepo.findById(app.club_id);
    if (!club || club.primary_user_id !== user.id) throw ApiError.forbidden();
    return;
  }
  // applicant: must own the profile
  const profile = await profilesRepo.findById(app.profile_id);
  if (!profile || profile.user_id !== user.id) throw ApiError.forbidden();
}

async function assertCanEdit(user, app) {
  await assertCanView(user, app);
  // Admins can correct on behalf of an applicant in any status that isn't archived.
  if (user.role === 'admin') {
    if (app.status === STATUS.SEASON_CLOSED) {
      throw ApiError.forbidden('Application is locked because the season has closed');
    }
    return;
  }
  if (app.status === STATUS.DRAFT) {
    const tournament = await tournamentsRepo.findById(app.tournament_id);
    assertRegistrationWindowOpen(tournament);
    return;
  }
  if (app.status === STATUS.NEEDS_CORRECTION) {
    // Only within correction window.
    if (app.correction_due_at && new Date(app.correction_due_at).getTime() < Date.now()) {
      throw ApiError.forbidden('Correction window closed');
    }
    return;
  }
  if (app.status === STATUS.SEASON_CLOSED) {
    throw ApiError.forbidden('Application is locked because the season has closed');
  }
  throw ApiError.forbidden(`Cannot edit application in status ${app.status}`);
}

// ---- Create / update ---------------------------------------------------------
async function create(user, { tournamentId, profileId, formData }, ctx = {}) {
  const tournament = await tournamentsRepo.findById(tournamentId);
  if (!tournament) throw ApiError.badRequest('Unknown tournament', { field: 'tournamentId' });
  assertRegistrationWindowOpen(tournament);

  let profile;
  if (user.role === 'applicant') {
    profile = await profilesRepo.findByUserId(user.id);
    if (!profile) throw ApiError.badRequest('Create your profile first');
  } else {
    if (!profileId) throw ApiError.badRequest('profileId required');
    profile = await profilesRepo.findById(profileId);
    if (!profile) throw ApiError.notFound('Profile not found');
    if (user.role === 'club') {
      if (!profile.club_id) throw ApiError.forbidden('Profile is not linked to a club');
      const club = await clubsRepo.findById(profile.club_id);
      if (!club || club.primary_user_id !== user.id) throw ApiError.forbidden();
    }
  }
  const existingApplication = await appsRepo.findByProfileAndTournament(profile.id, tournamentId);
  if (existingApplication) {
    throw ApiError.conflict('Application already exists for this tournament', {
      tournamentId,
      applicationId: existingApplication.id,
    });
  }
  const categories = assertOfficialCategories(profile, formData || {});
  const app = await appsRepo.create({
    profileId: profile.id,
    tournamentId,
    clubId: profile.club_id || null,
    submittedBy: user.id,
    formData: { ...(formData || {}), categoryEntries: categories },
  });
  await seRepo.add({ applicationId: app.id, fromStatus: null, toStatus: STATUS.DRAFT,
    actorUserId: user.id, actorRole: user.role, reason: 'Draft created' });
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'application.create',
    entityType: 'application', entityId: app.id, payload: { tournamentId }, requestIp: ctx.ip });
  return app;
}

async function updateDraft(user, id, { formData }, ctx = {}) {
  const app = await appsRepo.findById(id);
  if (!app) throw ApiError.notFound();
  await assertCanEdit(user, app);
  const profile = await profilesRepo.findById(app.profile_id);
  if (!profile) throw ApiError.notFound('Profile not found');
  const merged = { ...(app.form_data || {}), ...(formData || {}) };
  const categories = assertOfficialCategories(profile, merged);
  merged.categoryEntries = categories;
  const updated = await appsRepo.updateForm(id, merged);
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'application.update',
    entityType: 'application', entityId: id, payload: { keys: Object.keys(formData || {}) }, requestIp: ctx.ip });
  return updated;
}

// ---- Transitions -------------------------------------------------------------
async function submit(user, id, ctx = {}) {
  const app = await appsRepo.findById(id);
  if (!app) throw ApiError.notFound();
  await assertCanView(user, app);
  if (app.status === STATUS.DRAFT) {
    const tournament = await tournamentsRepo.findById(app.tournament_id);
    assertRegistrationWindowOpen(tournament);
  }
  assertTransition(app.status, STATUS.SUBMITTED, user.role);
  const documents = await documentsRepo.listForApplication(id);
  const missing = REQUIRED_DOCUMENT_KINDS.filter((kind) => !documents.some((doc) => doc.kind === kind));
  if (missing.length) {
    throw ApiError.unprocessable('Required documents missing', { missing });
  }
  const profile = await profilesRepo.findById(app.profile_id);
  if (!profile) throw ApiError.notFound('Profile not found');
  const categories = assertOfficialCategories(profile, app.form_data || {});
  if (categories.length) await appsRepo.updateForm(id, { ...(app.form_data || {}), categoryEntries: categories });

  // Reject submission if any required document expires before the tournament starts.
  const tournamentForExpiry = await tournamentsRepo.findById(app.tournament_id);
  const tournamentStart = tournamentForExpiry?.starts_on ? new Date(tournamentForExpiry.starts_on) : null;
  if (tournamentStart) {
    const expired = documents
      .filter((doc) => REQUIRED_DOCUMENT_KINDS.includes(doc.kind) && doc.expires_on)
      .filter((doc) => new Date(doc.expires_on) < tournamentStart)
      .map((doc) => ({ kind: doc.kind, expiresOn: doc.expires_on }));
    if (expired.length) {
      throw ApiError.unprocessable('One or more required documents expire before the event start date.', { expired });
    }
  }

  // Auto-assign a reviewer if we don't have one yet (hybrid mode).
  const patch = {
    status: STATUS.SUBMITTED,
    submitted_at: new Date(),
    review_due_at: new Date(Date.now() + config.workflow.reviewSlaHours * HOUR),
    correction_due_at: null,
    correction_reason: null,
    correction_fields: null,
  };
  if (!app.reviewer_id) {
    const reviewer = await reviewersRepo.leastLoaded();
    if (reviewer) {
      patch.reviewer_id = reviewer.id;
      patch.reviewer_assigned_at = new Date();
    }
  }
  const updated = await appsRepo.setStatus(id, patch);
  await seRepo.add({ applicationId: id, fromStatus: app.status, toStatus: STATUS.SUBMITTED,
    actorUserId: user.id, actorRole: user.role, reason: app.status === STATUS.NEEDS_CORRECTION ? 'Correction resubmitted' : 'Submitted' });
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'application.submit',
    entityType: 'application', entityId: id, payload: { reviewerId: updated.reviewer_id }, requestIp: ctx.ip });

  await notifySubmission(updated);
  return updated;
}

async function uploadDocument(user, applicationId, { kind, label, expiresOn, file, capturedVia, idNumberLast4 }, ctx = {}) {
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  await assertCanEdit(user, app);
  if (!file) throw ApiError.badRequest('File required');

  const checksum = createHash('sha256').update(file.buffer).digest('hex');
  const storedDocument = await documentStorage.storeDocument(applicationId, file);
  const sourceTag = (capturedVia || 'upload').toLowerCase();

  const doc = await documentsRepo.create({
    applicationId,
    profileId: app.profile_id,
    kind,
    label: label || file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    storageKey: storedDocument.storageKey,
    checksumSha256: checksum,
    uploadedBy: user.id,
    expiresOn: expiresOn || null,
    originalFilename: file.originalname,
    capturedVia: ['upload', 'scan', 'admin_rescan'].includes(sourceTag) ? sourceTag : 'upload',
    idNumberLast4: idNumberLast4 || null,
  });
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'document.upload',
    entityType: 'application', entityId: applicationId, payload: { documentId: doc.id, kind, capturedVia: doc.captured_via }, requestIp: ctx.ip });
  return { ...doc, url: documentStorage.getPublicDocumentUrl(doc.storage_key) };
}

async function verifyDocument(user, applicationId, documentId, { verified, reason }, ctx = {}) {
  if (user.role !== 'admin' && user.role !== 'reviewer') throw ApiError.forbidden();
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  const doc = await documentsRepo.findById(documentId);
  if (!doc || doc.application_id !== applicationId) throw ApiError.notFound('Document not found');
  const effectiveReason = verified ? null : (reason || 'Rejected');
  const updated = await documentsRepo.setVerification(documentId, {
    verifiedBy: user.id,
    verified: Boolean(verified),
    verifyReason: effectiveReason,
  });
  await auditWrite({
    actorUserId: user.id,
    actorRole: user.role,
    action: verified ? 'document.verify' : 'document.reject',
    entityType: 'application',
    entityId: applicationId,
    payload: { documentId, kind: doc.kind, reason: effectiveReason },
    requestIp: ctx.ip,
  });
  return { ...updated, url: documentStorage.getPublicDocumentUrl(updated.storage_key) };
}

async function reapply(user, sourceApplicationId, { tournamentId }, ctx = {}) {
  const sourceApplication = await appsRepo.findById(sourceApplicationId);
  if (!sourceApplication) throw ApiError.notFound();
  await assertCanView(user, sourceApplication);

  const [sourceTournament, targetTournament] = await Promise.all([
    tournamentsRepo.findByIdAny ? tournamentsRepo.findByIdAny(sourceApplication.tournament_id) : tournamentsRepo.findById(sourceApplication.tournament_id),
    tournamentsRepo.findById(tournamentId),
  ]);
  if (!targetTournament) throw ApiError.badRequest('Unknown target tournament', { field: 'tournamentId' });
  assertRegistrationWindowOpen(targetTournament, 'Target tournament registration window is closed');
  if (sourceApplication.tournament_id === tournamentId) {
    throw ApiError.conflict('Cannot reapply into the same tournament', { tournamentId });
  }
  if (!isSeasonClosedSource(sourceApplication, sourceTournament)) {
    throw ApiError.conflict('Source application is not from a closed season', {
      sourceApplicationId,
      sourceStatus: sourceApplication.status,
    });
  }

  const existingApplication = await appsRepo.findByProfileAndTournament(sourceApplication.profile_id, tournamentId);
  if (existingApplication) {
    throw ApiError.conflict('Application already exists for this tournament', {
      tournamentId,
      applicationId: existingApplication.id,
    });
  }

  const nextApplication = await appsRepo.create({
    profileId: sourceApplication.profile_id,
    tournamentId,
    clubId: sourceApplication.club_id || null,
    submittedBy: user.id,
    formData: sourceApplication.form_data || {},
  });
  await seRepo.add({
    applicationId: nextApplication.id,
    fromStatus: null,
    toStatus: STATUS.DRAFT,
    actorUserId: user.id,
    actorRole: user.role,
    reason: `Reapplied from ${sourceApplicationId}`,
    metadata: {
      sourceApplicationId,
      sourceTournamentId: sourceApplication.tournament_id,
      targetTournamentId: tournamentId,
      kind: 'season_reapply',
    },
  });
  await auditWrite({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'application.reapply',
    entityType: 'application',
    entityId: nextApplication.id,
    payload: {
      sourceApplicationId,
      targetTournamentId: tournamentId,
    },
    requestIp: ctx.ip,
  });
  return nextApplication;
}

async function listDocuments(user, applicationId) {
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  await assertCanView(user, app);
  const documents = await documentsRepo.listForApplication(applicationId);
  return documents.map((doc) => ({
    ...doc,
    url: documentStorage.getPublicDocumentUrl(doc.storage_key),
  }));
}

async function getById(user, id) {
  const app = await appsRepo.findFullById(id);
  if (!app) throw ApiError.notFound();
  await assertCanView(user, app);
  const [events, documents] = await Promise.all([
    seRepo.listForApplication(id),
    documentsRepo.listForApplication(id),
  ]);
  return withAvatarUrlFromDocuments({
    ...app,
    documents: documents.map((doc) => ({ ...doc, url: documentStorage.getPublicDocumentUrl(doc.storage_key) })),
    statusEvents: events,
  }, documents);
}

async function listForMe(user, query = {}) {
  // Scope by role.
  if (user.role === 'admin' || user.role === 'reviewer') return appsRepo.query(query).then((list) => list.map(withDisplayFields));
  if (user.role === 'club') {
    const clubs = await clubsRepo.listForUser(user.id);
    if (!clubs.length) return [];
    return appsRepo.query({ ...query, clubId: clubs[0].id }).then((list) => list.map(withDisplayFields));
  }
  // applicant
  const profile = await profilesRepo.findByUserId(user.id);
  if (!profile) return [];
  return appsRepo.query({ ...query }).then((list) => list.filter((a) => a.profile_id === profile.id).map(withDisplayFields));
}

async function requestCancel(user, id, { reason }, ctx = {}) {
  const app = await appsRepo.findById(id);
  if (!app) throw ApiError.notFound();
  await assertCanView(user, app);

  if ([STATUS.APPROVED, STATUS.REJECTED].includes(app.status)) {
    throw ApiError.badRequest('Cancellation request is only allowed before final decision');
  }

  const nextFormData = {
    ...(app.form_data || {}),
    cancelRequest: {
      requestedBy: user.id,
      requestedRole: user.role,
      reason,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    },
  };

  const updated = await appsRepo.updateForm(id, nextFormData);
  await seRepo.add({
    applicationId: id,
    fromStatus: app.status,
    toStatus: app.status,
    actorUserId: user.id,
    actorRole: user.role,
    reason: `Cancellation requested: ${reason}`,
    metadata: { kind: 'cancel_request' },
  });
  await auditWrite({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'application.cancel_request',
    entityType: 'application',
    entityId: id,
    payload: { reason },
    requestIp: ctx.ip,
  });
  return updated;
}

// ---- Notifications -----------------------------------------------------------
async function notifySubmission(app) {
  const full = await appsRepo.findFullById(app.id);
  if (!full) return;
  const user = full.submitted_by;
  if (!user) return;
  const { users: usersRepo } = require('../repositories');
  const u = await usersRepo.findById(user);
  if (!u) return;
  await notify({
    userId: u.id, applicationId: app.id,
    channels: ['email', 'push', 'whatsapp', 'sms'],
    to: { email: u.email, phone: u.phone, whatsapp: u.phone },
    template: 'application.submitted',
    payload: {
      applicantName: formatPersonName(full.first_name, full.last_name),
      applicationDisplayId: applicationDisplayId(app.id),
      tournamentName: full.tournament_name,
      slaHours: config.workflow.reviewSlaHours,
    },
  });
}

module.exports = { create, updateDraft, submit, reapply, uploadDocument, verifyDocument, listDocuments, getById, listForMe, requestCancel, assertCanView, assertCanEdit };

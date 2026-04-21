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
const path = require('path');
const fs = require('fs');

const HOUR = 60 * 60 * 1000;
const REQUIRED_DOCUMENT_KINDS = ['medical', 'photo_id', 'consent'];

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
  if (app.status === STATUS.DRAFT) return;
  if (app.status === STATUS.NEEDS_CORRECTION) {
    // Only within correction window.
    if (app.correction_due_at && new Date(app.correction_due_at).getTime() < Date.now()) {
      throw ApiError.forbidden('Correction window closed');
    }
    return;
  }
  throw ApiError.forbidden(`Cannot edit application in status ${app.status}`);
}

// ---- Create / update ---------------------------------------------------------
async function create(user, { tournamentId, profileId, formData }, ctx = {}) {
  const tournament = await tournamentsRepo.findById(tournamentId);
  if (!tournament) throw ApiError.badRequest('Unknown tournament', { field: 'tournamentId' });

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
  const app = await appsRepo.create({
    profileId: profile.id,
    tournamentId,
    clubId: profile.club_id || null,
    submittedBy: user.id,
    formData,
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
  const merged = { ...(app.form_data || {}), ...(formData || {}) };
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
  assertTransition(app.status, STATUS.SUBMITTED, user.role);
  const documents = await documentsRepo.listForApplication(id);
  const missing = REQUIRED_DOCUMENT_KINDS.filter((kind) => !documents.some((doc) => doc.kind === kind));
  if (missing.length) {
    throw ApiError.unprocessable('Required documents missing', { missing });
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

async function uploadDocument(user, applicationId, { kind, label, expiresOn, file }, ctx = {}) {
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  await assertCanEdit(user, app);
  if (!file) throw ApiError.badRequest('File required');

  const checksum = createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
  const relativeDir = path.join('applications', applicationId);
  const storageKey = path.join(relativeDir, file.filename).replace(/\\/g, '/');

  const doc = await documentsRepo.create({
    applicationId,
    profileId: app.profile_id,
    kind,
    label: label || file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    storageKey,
    checksumSha256: checksum,
    uploadedBy: user.id,
    expiresOn: expiresOn || null,
    originalFilename: file.originalname,
  });
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'document.upload',
    entityType: 'application', entityId: applicationId, payload: { documentId: doc.id, kind }, requestIp: ctx.ip });
  return { ...doc, url: `${config.appBaseUrl}/uploads/${doc.storage_key}` };
}

async function listDocuments(user, applicationId) {
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  await assertCanView(user, app);
  const documents = await documentsRepo.listForApplication(applicationId);
  return documents.map((doc) => ({
    ...doc,
    url: `${config.appBaseUrl}/uploads/${doc.storage_key}`,
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
  return {
    ...app,
    documents: documents.map((doc) => ({ ...doc, url: `${config.appBaseUrl}/uploads/${doc.storage_key}` })),
    statusEvents: events,
  };
}

async function listForMe(user, query = {}) {
  // Scope by role.
  if (user.role === 'admin' || user.role === 'reviewer') return appsRepo.query(query);
  if (user.role === 'club') {
    const clubs = await clubsRepo.listForUser(user.id);
    if (!clubs.length) return [];
    return appsRepo.query({ ...query, clubId: clubs[0].id });
  }
  // applicant
  const profile = await profilesRepo.findByUserId(user.id);
  if (!profile) return [];
  return appsRepo.query({ ...query }).then((list) => list.filter((a) => a.profile_id === profile.id));
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
      applicantName: `${full.first_name} ${full.last_name}`,
      tournamentName: full.tournament_name,
      slaHours: config.workflow.reviewSlaHours,
    },
  });
}

module.exports = { create, updateDraft, submit, uploadDocument, listDocuments, getById, listForMe, requestCancel, assertCanView, assertCanEdit };

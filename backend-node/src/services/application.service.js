const {
  applications: appsRepo, profiles: profilesRepo, tournaments: tournamentsRepo,
  statusEvents: seRepo, reviewers: reviewersRepo, clubs: clubsRepo,
} = require('../repositories');
const { STATUS, assertTransition } = require('../statusMachine');
const { ApiError } = require('../apiError');
const { config } = require('../config');
const { write: auditWrite } = require('../audit');
const { dispatch: notify } = require('../notifications');

const HOUR = 60 * 60 * 1000;

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

async function getById(user, id) {
  const app = await appsRepo.findFullById(id);
  if (!app) throw ApiError.notFound();
  await assertCanView(user, app);
  const events = await seRepo.listForApplication(id);
  return { ...app, statusEvents: events };
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

module.exports = { create, updateDraft, submit, getById, listForMe, assertCanView, assertCanEdit };

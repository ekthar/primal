const {
  applications: appsRepo, users: usersRepo, statusEvents: seRepo,
} = require('../repositories');
const { STATUS, assertTransition } = require('../statusMachine');
const { ApiError } = require('../apiError');
const { config } = require('../config');
const { write: auditWrite } = require('../audit');
const { dispatch: notify } = require('../notifications');

const HOUR = 60 * 60 * 1000;

async function assignReviewer(actor, applicationId, reviewerId, ctx = {}) {
  if (!['admin', 'reviewer'].includes(actor.role)) throw ApiError.forbidden();
  const reviewer = await usersRepo.findById(reviewerId);
  if (!reviewer || reviewer.role !== 'reviewer') throw ApiError.badRequest('Invalid reviewer');
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  const updated = await appsRepo.setStatus(applicationId, {
    reviewer_id: reviewerId,
    reviewer_assigned_at: new Date(),
  });
  await auditWrite({ actorUserId: actor.id, actorRole: actor.role, action: 'review.assign',
    entityType: 'application', entityId: applicationId, payload: { reviewerId }, requestIp: ctx.ip });
  return updated;
}

async function startReview(actor, applicationId, ctx = {}) {
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  assertTransition(app.status, STATUS.UNDER_REVIEW, actor.role);
  const updated = await appsRepo.setStatus(applicationId, {
    status: STATUS.UNDER_REVIEW,
    review_started_at: new Date(),
    reviewer_id: app.reviewer_id || actor.id,
    reviewer_assigned_at: app.reviewer_assigned_at || new Date(),
  });
  await seRepo.add({ applicationId, fromStatus: app.status, toStatus: STATUS.UNDER_REVIEW,
    actorUserId: actor.id, actorRole: actor.role, reason: 'Review started' });
  await auditWrite({ actorUserId: actor.id, actorRole: actor.role, action: 'review.start',
    entityType: 'application', entityId: applicationId, payload: {}, requestIp: ctx.ip });
  return updated;
}

async function decide(actor, applicationId, { action, reason, fields }, ctx = {}) {
  if (!['admin', 'reviewer'].includes(actor.role)) throw ApiError.forbidden();
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();

  let toStatus;
  const patch = { decided_at: new Date() };
  if (action === 'approve') toStatus = STATUS.APPROVED;
  else if (action === 'reject') { toStatus = STATUS.REJECTED; patch.rejection_reason = reason; }
  else if (action === 'request_correction') {
    toStatus = STATUS.NEEDS_CORRECTION;
    patch.correction_reason = reason;
    patch.correction_fields = fields || [];
    patch.correction_due_at = new Date(Date.now() + config.workflow.correctionWindowHours * HOUR);
  } else throw ApiError.badRequest('Unknown action');

  assertTransition(app.status, toStatus, actor.role);
  patch.status = toStatus;
  if (!app.review_started_at) patch.review_started_at = new Date();

  const updated = await appsRepo.setStatus(applicationId, patch);
  await seRepo.add({ applicationId, fromStatus: app.status, toStatus, reason,
    metadata: { fields: fields || [] }, actorUserId: actor.id, actorRole: actor.role });
  await auditWrite({ actorUserId: actor.id, actorRole: actor.role, action: `review.${action}`,
    entityType: 'application', entityId: applicationId, payload: { reason, fields }, requestIp: ctx.ip });

  await notifyDecision(updated, toStatus, reason);
  return updated;
}

async function bulkDecide(actor, { ids, action, reason, fields }, ctx = {}) {
  const results = [];
  for (const id of ids) {
    try {
      const r = await decide(actor, id, { action, reason, fields }, ctx);
      results.push({ id, ok: true, status: r.status });
    } catch (e) {
      results.push({ id, ok: false, code: e.code || 'ERROR', message: e.message });
    }
  }
  return results;
}

/** Reopen rejected application (admin override). */
async function reopen(actor, applicationId, { reason }, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  assertTransition(app.status, STATUS.UNDER_REVIEW, actor.role);
  const updated = await appsRepo.setStatus(applicationId, {
    status: STATUS.UNDER_REVIEW,
    reopen_reason: reason,
    review_started_at: new Date(),
  });
  await seRepo.add({ applicationId, fromStatus: app.status, toStatus: STATUS.UNDER_REVIEW,
    reason: `Reopened: ${reason}`, actorUserId: actor.id, actorRole: actor.role });
  await auditWrite({ actorUserId: actor.id, actorRole: actor.role, action: 'application.reopen',
    entityType: 'application', entityId: applicationId, payload: { reason }, requestIp: ctx.ip });
  return updated;
}

async function notifyDecision(app, toStatus, reason) {
  const full = await appsRepo.findFullById(app.id);
  if (!full || !full.submitted_by) return;
  const user = await usersRepo.findById(full.submitted_by);
  if (!user) return;
  const template =
    toStatus === STATUS.APPROVED ? 'application.approved' :
    toStatus === STATUS.REJECTED ? 'application.rejected' :
    toStatus === STATUS.NEEDS_CORRECTION ? 'application.needs_correction' : null;
  if (!template) return;
  await notify({
    userId: user.id, applicationId: app.id,
    channels: ['email', 'push', 'whatsapp', 'sms'],
    to: { email: user.email, phone: user.phone, whatsapp: user.phone },
    template,
    payload: {
      applicantName: `${full.first_name} ${full.last_name}`,
      tournamentName: full.tournament_name,
      reason,
      dueAt: app.correction_due_at,
      appealWindowDays: config.workflow.appealWindowDays,
    },
  });
}

module.exports = { assignReviewer, startReview, decide, bulkDecide, reopen };

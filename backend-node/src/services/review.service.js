const {
  applications: appsRepo, users: usersRepo, statusEvents: seRepo,
} = require('../repositories');
const { STATUS, assertTransition } = require('../statusMachine');
const { ApiError } = require('../apiError');
const { config } = require('../config');
const { write: auditWrite } = require('../audit');
const { dispatch: notify } = require('../notifications');
const webhookService = require('./webhook.service');
const bracketService = require('./bracket.service');
const { formatPersonName, applicationDisplayId } = require('./identity.service');
const { logger } = require('../logger');

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
  await notifyApplication(updated, 'application.under_review', null);
  return updated;
}

async function decide(actor, applicationId, { action, reason, fields }, ctx = {}) {
  if (!['admin', 'reviewer'].includes(actor.role)) throw ApiError.forbidden();
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  if (![STATUS.SUBMITTED, STATUS.UNDER_REVIEW].includes(app.status)) {
    throw ApiError.conflict('Only submitted or under-review applications can be decided', {
      applicationId,
      currentStatus: app.status,
      action,
    });
  }

  let toStatus;
  const patch = { decided_at: new Date() };
  if (action === 'approve') toStatus = STATUS.APPROVED;
  else if (action === 'reject') { toStatus = STATUS.REJECTED; patch.rejection_reason = reason; }
  else if (action === 'request_correction') {
    toStatus = STATUS.NEEDS_CORRECTION;
    patch.correction_reason = reason;
    patch.correction_fields = JSON.stringify(fields || []);
    patch.correction_due_at = new Date(Date.now() + config.workflow.correctionWindowHours * HOUR);
  } else throw ApiError.badRequest('Unknown action');

  logger.info({
    applicationId,
    currentStatus: app.status,
    nextStatus: toStatus,
    actorRole: actor.role,
    actorUserId: actor.id,
    action,
    reason,
    fields,
  }, 'review.decision.requested');

  assertTransition(app.status, toStatus, actor.role);
  patch.status = toStatus;
  if (!app.review_started_at) patch.review_started_at = new Date();

  const updated = await appsRepo.setStatus(applicationId, patch);
  await seRepo.add({ applicationId, fromStatus: app.status, toStatus, reason,
    metadata: { fields: fields || [] }, actorUserId: actor.id, actorRole: actor.role });
  await auditWrite({ actorUserId: actor.id, actorRole: actor.role, action: `review.${action}`,
    entityType: 'application', entityId: applicationId, payload: { reason, fields }, requestIp: ctx.ip });

  await bracketService.refreshSuggestedForTournament(app.tournament_id, { actorUserId: actor.id });
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
  if (![STATUS.APPROVED, STATUS.REJECTED].includes(app.status)) {
    throw ApiError.conflict('Only approved or rejected applications can be reopened', {
      applicationId,
      currentStatus: app.status,
    });
  }
  logger.info({
    applicationId,
    currentStatus: app.status,
    actorRole: actor.role,
    actorUserId: actor.id,
    reason,
  }, 'review.reopen.requested');
  assertTransition(app.status, STATUS.UNDER_REVIEW, actor.role);
  const updated = await appsRepo.setStatus(applicationId, {
    status: STATUS.UNDER_REVIEW,
    reopen_reason: reason,
    reopened_at: new Date(),
    reopened_by: actor.id,
    review_started_at: new Date(),
  });
  await seRepo.add({ applicationId, fromStatus: app.status, toStatus: STATUS.UNDER_REVIEW,
    reason: `Reopened: ${reason}`, actorUserId: actor.id, actorRole: actor.role });
  await auditWrite({ actorUserId: actor.id, actorRole: actor.role, action: 'application.reopen',
    entityType: 'application', entityId: applicationId, payload: { reason }, requestIp: ctx.ip });
  await bracketService.refreshSuggestedForTournament(app.tournament_id, { actorUserId: actor.id });
  await notifyApplication(updated, 'application.reopened', reason);
  return updated;
}

async function notifyApplication(app, template, reason) {
  const full = await appsRepo.findFullById(app.id);
  if (!full || !full.submitted_by) return;
  const user = await usersRepo.findById(full.submitted_by);
  if (!user) return;
  await notify({
    userId: user.id, applicationId: app.id,
    channels: ['whatsapp', 'email', 'sms'],
    to: { email: user.email, phone: user.phone, whatsapp: user.phone },
    template,
    payload: {
      applicantName: formatPersonName(full.first_name, full.last_name),
      applicationDisplayId: applicationDisplayId(app.id),
      tournamentName: full.tournament_name,
      reason,
      dueAt: app.correction_due_at,
      appealWindowDays: config.workflow.appealWindowDays,
      slaHours: config.workflow.reviewSlaHours,
    },
  });
}

async function notifyDecision(app, toStatus, reason) {
  const template =
    toStatus === STATUS.APPROVED ? 'application.approved' :
    toStatus === STATUS.REJECTED ? 'application.rejected' :
    toStatus === STATUS.NEEDS_CORRECTION ? 'application.needs_correction' : null;
  if (!template) return;
  await notifyApplication(app, template, reason);
  const full = await appsRepo.findFullById(app.id);
  if (!full) return;
  webhookService.emitAsync(template, {
    applicationId: app.id,
    applicationDisplayId: applicationDisplayId(app.id),
    status: toStatus,
    tournamentName: full.tournament_name,
    tournamentSlug: full.tournament_slug || null,
    applicantName: formatPersonName(full.first_name, full.last_name),
    reason: reason || null,
  });
}

module.exports = { assignReviewer, startReview, decide, bulkDecide, reopen };

const { appeals: appealsRepo, applications: appsRepo, statusEvents: seRepo } = require('../repositories');
const { STATUS, assertTransition } = require('../statusMachine');
const { ApiError } = require('../apiError');
const { config } = require('../config');
const { write: auditWrite } = require('../audit');

const DAY = 24 * 60 * 60 * 1000;

async function assertCanAppeal(user, app) {
  if (user.role === 'admin' || user.role === 'reviewer') return;
  if (user.role === 'club') {
    if (!app.club_id) throw ApiError.forbidden();
    const { clubs: clubsRepo } = require('../repositories');
    const club = await clubsRepo.findById(app.club_id);
    if (!club || club.primary_user_id !== user.id) throw ApiError.forbidden();
    return;
  }
  const { profiles: profilesRepo } = require('../repositories');
  const profile = await profilesRepo.findById(app.profile_id);
  if (!profile || profile.user_id !== user.id) throw ApiError.forbidden();
}

async function file(user, { applicationId, reason }, ctx = {}) {
  const app = await appsRepo.findById(applicationId);
  if (!app) throw ApiError.notFound();
  await assertCanAppeal(user, app);
  if (![STATUS.REJECTED, STATUS.NEEDS_CORRECTION].includes(app.status)) {
    throw ApiError.badRequest('Only rejected or correction-required applications can be appealed');
  }
  if (app.decided_at) {
    const age = Date.now() - new Date(app.decided_at).getTime();
    if (age > config.workflow.appealWindowDays * DAY) {
      throw ApiError.forbidden('Appeal window closed');
    }
  }
  const appeal = await appealsRepo.create({ applicationId, filedBy: user.id, reason });
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'appeal.file',
    entityType: 'appeal', entityId: appeal.id, payload: { applicationId }, requestIp: ctx.ip });
  return appeal;
}

async function listOpen(user) {
  if (!['admin', 'reviewer'].includes(user.role)) throw ApiError.forbidden();
  return appealsRepo.listOpen();
}

async function listMine(user) {
  return appealsRepo.listForUser(user.id);
}

async function decide(user, id, { action, panelDecision }, ctx = {}) {
  if (user.role !== 'admin') throw ApiError.forbidden();
  const appeal = await appealsRepo.findById(id);
  if (!appeal) throw ApiError.notFound();

  const status = action === 'grant' ? 'granted' : 'denied';
  const updated = await appealsRepo.decide(id, { status, panelDecision, decidedBy: user.id });

  // If granted, reopen the underlying application for review.
  if (action === 'grant') {
    const app = await appsRepo.findById(appeal.application_id);
    if (app && assertTransition(app.status, STATUS.UNDER_REVIEW, 'admin') !== false) {
      await appsRepo.setStatus(app.id, {
        status: STATUS.UNDER_REVIEW,
        reopen_reason: `Appeal ${id} granted`,
        review_started_at: new Date(),
      });
      await seRepo.add({ applicationId: app.id, fromStatus: app.status, toStatus: STATUS.UNDER_REVIEW,
        reason: `Appeal granted: ${panelDecision}`, actorUserId: user.id, actorRole: 'admin' });
    }
  }

  await auditWrite({ actorUserId: user.id, actorRole: 'admin', action: `appeal.${status}`,
    entityType: 'appeal', entityId: id, payload: { panelDecision }, requestIp: ctx.ip });
  return updated;
}

module.exports = { file, listOpen, listMine, decide };

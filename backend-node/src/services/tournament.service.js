const { tournaments: tournamentsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');

async function listAdmin(actor, query = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  return tournamentsRepo.listAdmin(query);
}

async function updateAdmin(actor, tournamentId, patch, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const existing = await tournamentsRepo.findById(tournamentId);
  if (!existing) throw ApiError.notFound('Tournament not found');

  const next = await tournamentsRepo.updateAdmin(tournamentId, patch);
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'tournament.update',
    entityType: 'tournament',
    entityId: tournamentId,
    payload: patch,
    requestIp: ctx.ip,
  });
  return next;
}

module.exports = { listAdmin, updateAdmin };

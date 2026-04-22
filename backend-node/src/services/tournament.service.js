const { tournaments: tournamentsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');

function getRegistrationState(tournament) {
  if (!tournament) {
    return {
      registrationConfigured: false,
      registrationOpen: false,
    };
  }

  const openAt = tournament.registration_open_at ? new Date(tournament.registration_open_at).getTime() : null;
  const closeAt = tournament.registration_close_at ? new Date(tournament.registration_close_at).getTime() : null;
  const registrationConfigured = Number.isFinite(openAt) && Number.isFinite(closeAt);

  if (!registrationConfigured) {
    return {
      registrationConfigured: false,
      registrationOpen: false,
    };
  }

  const now = Date.now();
  return {
    registrationConfigured: true,
    registrationOpen: now >= openAt && now <= closeAt,
  };
}

function enrichPublicTournament(tournament) {
  const state = getRegistrationState(tournament);
  return {
    ...tournament,
    ...state,
  };
}

async function listPublic() {
  const tournaments = await tournamentsRepo.listPublic();
  return tournaments.map(enrichPublicTournament);
}

async function hasOpenPublicRegistration() {
  const tournaments = await listPublic();
  return tournaments.some((tournament) => tournament.registrationOpen);
}

async function listAdmin(actor, query = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  return tournamentsRepo.listAdmin(query);
}

async function createAdmin(actor, payload, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const existing = await tournamentsRepo.listAdmin({ q: payload.slug, limit: 50, offset: 0 });
  if (existing.some((item) => item.slug === payload.slug)) {
    throw ApiError.conflict('Tournament slug already exists', { field: 'slug' });
  }
  const tournament = await tournamentsRepo.createAdmin(payload);
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'tournament.create',
    entityType: 'tournament',
    entityId: tournament.id,
    payload,
    requestIp: ctx.ip,
  });
  return tournament;
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

async function archiveAdmin(actor, tournamentId, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const existing = await tournamentsRepo.findById(tournamentId);
  if (!existing) throw ApiError.notFound('Tournament not found');
  const next = await tournamentsRepo.softDelete(tournamentId);
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'tournament.archive',
    entityType: 'tournament',
    entityId: tournamentId,
    payload: { slug: existing.slug, name: existing.name },
    requestIp: ctx.ip,
  });
  return next;
}

module.exports = { listAdmin, createAdmin, updateAdmin, archiveAdmin, listPublic, hasOpenPublicRegistration, enrichPublicTournament, getRegistrationState };

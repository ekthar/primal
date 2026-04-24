const { applications: applicationsRepo, statusEvents: statusEventsRepo, tournaments: tournamentsRepo } = require('../repositories');
const { ApiError } = require('../apiError');
const { write: auditWrite } = require('../audit');
const { STATUS } = require('../statusMachine');

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

/**
 * Pure selection — given the already-enriched list of public tournaments,
 * return the one that should act as the default "current season" filter.
 *
 * Selection order:
 *   1. Any public tournament whose registration window is OPEN right now.
 *   2. Else any public tournament whose event dates (starts_on..ends_on)
 *      cover today, extended by a 30-day post-event grace window so admins
 *      finishing paperwork don't lose the "current" label the day after.
 *   3. Else the most recently created public tournament (already pre-ordered
 *      by the repo by `starts_on DESC`, so the first element is newest).
 *
 * Exposed as a named export so unit tests can exercise each branch without
 * standing up a database.
 */
function chooseCurrentSeason(tournaments, now = Date.now()) {
  if (!Array.isArray(tournaments) || !tournaments.length) return null;

  const openNow = tournaments.find((tournament) => tournament.registrationOpen);
  if (openNow) return openNow;

  const GRACE_MS = 30 * 24 * 60 * 60 * 1000;
  const runningNow = tournaments.find((tournament) => {
    const starts = tournament.starts_on ? new Date(tournament.starts_on).getTime() : null;
    const ends = tournament.ends_on ? new Date(tournament.ends_on).getTime() : null;
    if (!Number.isFinite(starts) || !Number.isFinite(ends)) return false;
    return now >= starts && now <= ends + GRACE_MS;
  });
  if (runningNow) return runningNow;

  return tournaments[0];
}

async function currentPublicSeason() {
  return chooseCurrentSeason(await listPublic(), Date.now());
}

async function closePriorSeasonApplications(actor, tournament) {
  const state = getRegistrationState(tournament);
  if (!tournament?.is_public || !state.registrationOpen) return [];

  const closedApplications = await applicationsRepo.closeUnfinishedForOtherTournaments({
    activeTournamentId: tournament.id,
    actorUserId: actor?.id || null,
  });

  if (!closedApplications.length) return [];

  await Promise.all(closedApplications.map((applicationRow) => statusEventsRepo.add({
    applicationId: applicationRow.id,
    fromStatus: applicationRow.previous_status || null,
    toStatus: STATUS.SEASON_CLOSED,
    reason: `Season closed because ${tournament.name} opened for registration`,
    metadata: {
      kind: 'season_rollover',
      activeTournamentId: tournament.id,
      activeTournamentName: tournament.name,
    },
    actorUserId: actor?.id || null,
    actorRole: actor?.role || 'system',
  })));

  return closedApplications;
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
  const rolledOver = await closePriorSeasonApplications(actor, tournament);
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'tournament.create',
    entityType: 'tournament',
    entityId: tournament.id,
    payload: {
      ...payload,
      closedApplicationCount: rolledOver.length,
    },
    requestIp: ctx.ip,
  });
  return tournament;
}

async function updateAdmin(actor, tournamentId, patch, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const existing = await tournamentsRepo.findByIdAny(tournamentId);
  if (!existing) throw ApiError.notFound('Tournament not found');

  const next = await tournamentsRepo.updateAdmin(tournamentId, patch);
  const rolledOver = await closePriorSeasonApplications(actor, next);
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'tournament.update',
    entityType: 'tournament',
    entityId: tournamentId,
    payload: {
      ...patch,
      closedApplicationCount: rolledOver.length,
    },
    requestIp: ctx.ip,
  });
  return next;
}

async function archiveAdmin(actor, tournamentId, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const existing = await tournamentsRepo.findByIdAny(tournamentId);
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

module.exports = { listAdmin, createAdmin, updateAdmin, archiveAdmin, listPublic, currentPublicSeason, chooseCurrentSeason, hasOpenPublicRegistration, enrichPublicTournament, getRegistrationState };

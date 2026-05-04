const { Router } = require('express');
const { ah, validate } = require('../middleware');
const { applications, tournaments, clubs } = require('../repositories');
const clubsService = require('../services/club.service');
const circularsService = require('../services/circular.service');
const tournamentService = require('../services/tournament.service');
const albumService = require('../services/album.service');
const { schemas } = require('../validators');
const { verifySignatureForApplication } = require('../pdfSignature');
const { config } = require('../config');
const { getIndiaStates, getDistrictsByState, getCanonicalStateName, lookupPincode } = require('../indiaLocations');
const { write: auditWrite } = require('../audit');
const { formatPersonName, applicationDisplayId } = require('../services/identity.service');

const router = Router();

const PUBLIC_CACHE_HEADER = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400';
const PUBLIC_HOME_CACHE_TTL_MS = 60 * 1000;
let publicHomeCache = null;

function setPublicCache(res) {
  res.set('Cache-Control', PUBLIC_CACHE_HEADER);
}

function sendPublicJson(res, payload) {
  setPublicCache(res);
  res.json(payload);
}

function isFreshCache(entry, now) {
  return Boolean(entry && now < entry.expiresAt);
}

async function buildPublicHomePayload() {
  const [tournamentList, recentPhotos, circularList] = await Promise.all([
    tournamentService.listPublic(),
    albumService.listRecentPublicPhotos({ limit: 14 }),
    circularsService.listPublic({ limit: 8 }),
  ]);

  return {
    tournaments: tournamentList,
    currentTournament: tournamentService.chooseCurrentSeason(tournamentList, Date.now()),
    recentPhotos,
    circulars: circularList,
  };
}

/** Public: list approved participants (optionally by tournament). */
router.get('/participants', ah(async (req, res) => {
  const participants = await applications.publicApproved({
    limit: parseInt(req.query.limit || '100', 10),
    tournamentSlug: req.query.tournament || null,
  });
  sendPublicJson(res, { participants });
}));

router.get('/home', ah(async (_req, res) => {
  const now = Date.now();
  if (isFreshCache(publicHomeCache, now)) {
    sendPublicJson(res, publicHomeCache.payload);
    return;
  }

  const payload = await buildPublicHomePayload();
  publicHomeCache = {
    payload,
    expiresAt: now + PUBLIC_HOME_CACHE_TTL_MS,
  };
  sendPublicJson(res, payload);
}));

router.get('/tournaments', ah(async (_req, res) => {
  sendPublicJson(res, { tournaments: await tournamentService.listPublic() });
}));

/* Current season — the single tournament that client-side UIs treat as the
   default filter for season-scoped screens (weigh-in board, applicant
   dashboard's current tab, reports). Returns 200 with `tournament: null`
   when no public tournaments exist so the UI can gracefully render a
   "no active season" state instead of erroring.
   MUST be registered before the /:slug parameterized route below. */
router.get('/tournaments/current', ah(async (_req, res) => {
  sendPublicJson(res, { tournament: await tournamentService.currentPublicSeason() });
}));

router.get('/tournaments/:slug', ah(async (req, res) => {
  const tournament = await tournaments.findPublicBySlug(req.params.slug);
  if (!tournament) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'tournament not found' } });
  const enriched = tournamentService.enrichPublicTournament(tournament);
  const [participants, tournamentAlbums] = await Promise.all([
    applications.publicApproved({ limit: 500, tournamentSlug: req.params.slug }),
    albumService.listAlbums({ publicOnly: true, tournamentSlug: req.params.slug }),
  ]);
  sendPublicJson(res, { tournament: enriched, participants, albums: tournamentAlbums });
}));

router.get('/athletes/:id', ah(async (req, res) => {
  const athlete = await applications.publicAthlete(req.params.id);
  if (!athlete) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'athlete not found' } });
  sendPublicJson(res, { athlete });
}));

router.get('/clubs', ah(async (req, res) => {
  sendPublicJson(res, { clubs: await clubsService.listPublicClubs({ q: req.query.q }) });
}));

// Public: photo albums
router.get('/albums', ah(async (req, res) => {
  sendPublicJson(res, { albums: await albumService.listAlbums({ publicOnly: true, tournamentSlug: req.query.tournament || null }) });
}));

router.get('/albums/recent-photos', ah(async (req, res) => {
  const limit = Math.max(1, Math.min(40, parseInt(req.query.limit || '12', 10) || 12));
  sendPublicJson(res, { photos: await albumService.listRecentPublicPhotos({ limit }) });
}));

router.get('/albums/:id', ah(async (req, res) => {
  const album = await albumService.getAlbum(req.params.id, { publicOnly: true });
  if (!album) return res.status(404).json({ error: 'not_found' });
  sendPublicJson(res, { album });
}));

// Public: circulars / announcements
router.get('/circulars', validate(schemas.circulars.listPublic, 'query'), ah(async (req, res) => {
  const circulars = await circularsService.listPublic({ kind: req.query.kind, limit: req.query.limit });
  sendPublicJson(res, { circulars });
}));

router.get('/india/states', ah(async (_req, res) => {
  sendPublicJson(res, { country: 'India', states: getIndiaStates() });
}));

router.get('/india/districts', ah(async (req, res) => {
  const stateInput = String(req.query.state || '').trim();
  if (!stateInput) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'state is required' } });
    return;
  }

  const state = getCanonicalStateName(stateInput);
  if (!state) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'State/UT not found in India directory' } });
    return;
  }

  sendPublicJson(res, {
    country: 'India',
    state,
    districts: getDistrictsByState(state),
  });
}));

router.get('/india/pincode/:pincode', ah(async (req, res) => {
  const location = lookupPincode(req.params.pincode);
  if (!location) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'PIN code not found in India directory' } });
    return;
  }
  sendPublicJson(res, { location });
}));

router.get('/verify/application-signature', ah(async (req, res) => {
  const aid = String(req.query.aid || '');
  if (!aid) {
    res.status(400).json({ valid: false, reason: 'aid is required' });
    return;
  }

  const app = await applications.findFullById(aid);
  if (!app) {
    res.status(404).json({ valid: false, reason: 'Application not found' });
    return;
  }

  const verification = verifySignatureForApplication(req.query, app);
  const issuedAtMs = Number(req.query.iat) * 1000;
  const issuedAt = Number.isFinite(issuedAtMs) ? new Date(issuedAtMs) : null;
  await auditWrite({
    actorUserId: null,
    actorRole: 'public',
    action: verification.valid ? 'qr.verify' : 'qr.verify.failed',
    entityType: 'application',
    entityId: app.id,
    payload: {
      reason: verification.reason,
      digest: req.query.dig || null,
    },
    requestIp: req.ip,
  });
  res.status(verification.valid ? 200 : 400).json({
    valid: verification.valid,
    reason: verification.reason,
    brand: config.pdf?.brandName || 'Primal',
    application: {
      id: app.id,
      displayId: applicationDisplayId(app.id),
      applicant: formatPersonName(app.first_name, app.last_name),
      tournament: app.tournament_name || null,
      status: app.status,
      updatedAt: app.updated_at,
    },
    issuedAt: issuedAt && !Number.isNaN(issuedAt.getTime()) ? issuedAt.toISOString() : null,
    digest: req.query.dig || null,
    expectedDigest: verification.expectedDigest || null,
  });
}));

module.exports = router;

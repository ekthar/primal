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

/** Public: list approved participants (optionally by tournament). */
router.get('/participants', ah(async (req, res) => {
  const participants = await applications.publicApproved({
    limit: parseInt(req.query.limit || '100', 10),
    tournamentSlug: req.query.tournament || null,
  });
  res.json({ participants });
}));

router.get('/tournaments', ah(async (_req, res) => {
  res.json({ tournaments: await tournamentService.listPublic() });
}));

router.get('/tournaments/:slug', ah(async (req, res) => {
  const tournament = await tournaments.findPublicBySlug(req.params.slug);
  if (!tournament) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'tournament not found' } });
  const enriched = tournamentService.enrichPublicTournament(tournament);
  const [participants, tournamentAlbums] = await Promise.all([
    applications.publicApproved({ limit: 500, tournamentSlug: req.params.slug }),
    albumService.listAlbums({ publicOnly: true, tournamentSlug: req.params.slug }),
  ]);
  res.json({ tournament: enriched, participants, albums: tournamentAlbums });
}));

router.get('/athletes/:id', ah(async (req, res) => {
  const athlete = await applications.publicAthlete(req.params.id);
  if (!athlete) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'athlete not found' } });
  res.json({ athlete });
}));

/* Current season — the single tournament that client-side UIs treat as the
   default filter for season-scoped screens (weigh-in board, applicant
   dashboard's current tab, reports). Returns 200 with `tournament: null`
   when no public tournaments exist so the UI can gracefully render a
   "no active season" state instead of erroring. */
router.get('/tournaments/current', ah(async (_req, res) => {
  res.json({ tournament: await tournamentService.currentPublicSeason() });
}));

router.get('/clubs', ah(async (req, res) => {
  res.json({ clubs: await clubsService.listPublicClubs({ q: req.query.q }) });
}));

// Public: photo albums
router.get('/albums', ah(async (req, res) => {
  res.json({ albums: await albumService.listAlbums({ publicOnly: true, tournamentSlug: req.query.tournament || null }) });
}));

router.get('/albums/recent-photos', ah(async (req, res) => {
  const limit = Math.max(1, Math.min(40, parseInt(req.query.limit || '12', 10) || 12));
  res.json({ photos: await albumService.listRecentPublicPhotos({ limit }) });
}));

router.get('/albums/:id', ah(async (req, res) => {
  const album = await albumService.getAlbum(req.params.id, { publicOnly: true });
  if (!album) return res.status(404).json({ error: 'not_found' });
  res.json({ album });
}));

// Public: circulars / announcements
router.get('/circulars', validate(schemas.circulars.listPublic, 'query'), ah(async (req, res) => {
  const circulars = await circularsService.listPublic({ kind: req.query.kind, limit: req.query.limit });
  res.json({ circulars });
}));

router.get('/india/states', ah(async (_req, res) => {
  res.json({ country: 'India', states: getIndiaStates() });
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

  res.json({
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
  res.json({ location });
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

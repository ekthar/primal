const { Router } = require('express');
const { ah, validate } = require('../middleware');
const { applications, tournaments, clubs } = require('../repositories');
const clubsService = require('../services/club.service');
const circularsService = require('../services/circular.service');
const { schemas } = require('../validators');
const { verifySignatureForApplication } = require('../pdfSignature');
const { config } = require('../config');

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
  res.json({ tournaments: await tournaments.listPublic() });
}));

router.get('/clubs', ah(async (req, res) => {
  res.json({ clubs: await clubsService.listPublicClubs({ q: req.query.q }) });
}));

// Public: circulars / announcements
router.get('/circulars', validate(schemas.circulars.listPublic, 'query'), ah(async (req, res) => {
  const circulars = await circularsService.listPublic({ kind: req.query.kind, limit: req.query.limit });
  res.json({ circulars });
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
  res.status(verification.valid ? 200 : 400).json({
    valid: verification.valid,
    reason: verification.reason,
    brand: config.pdf?.brandName || 'Primal',
    application: {
      id: app.id,
      applicant: `${app.first_name || ''} ${app.last_name || ''}`.trim(),
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

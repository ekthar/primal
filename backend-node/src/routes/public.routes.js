const { Router } = require('express');
const { ah, validate } = require('../middleware');
const { applications, tournaments, clubs } = require('../repositories');
const clubsService = require('../services/club.service');
const circularsService = require('../services/circular.service');
const { schemas } = require('../validators');

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

module.exports = router;

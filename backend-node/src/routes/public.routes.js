const { Router } = require('express');
const { ah } = require('../middleware');
const { applications, tournaments, clubs } = require('../repositories');
const clubsService = require('../services/club.service');

const router = Router();

/** Public: list approved participants (optionally by tournament). */
router.get('/participants', ah(async (req, res) => {
  const list = await applications.publicApproved(parseInt(req.query.limit || '100', 10));
  const filtered = req.query.tournament
    ? list.filter((a) => a.tournament_slug === req.query.tournament)
    : list;
  res.json({ participants: filtered });
}));

router.get('/tournaments', ah(async (_req, res) => {
  res.json({ tournaments: await tournaments.listPublic() });
}));

router.get('/clubs', ah(async (req, res) => {
  res.json({ clubs: await clubsService.listPublicClubs({ q: req.query.q }) });
}));

module.exports = router;

const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const tournaments = require('../services/tournament.service');

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', validate(schemas.tournament.adminList, 'query'), ah(async (req, res) => {
  res.json({ tournaments: await tournaments.listAdmin(req.user, req.query) });
}));

router.patch('/:id', validate(schemas.tournament.adminUpdate), ah(async (req, res) => {
  res.json({ tournament: await tournaments.updateAdmin(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

module.exports = router;

const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const tournaments = require('../services/tournament.service');
const divisions = require('../services/match.service');

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', validate(schemas.tournament.adminList, 'query'), ah(async (req, res) => {
  res.json({ tournaments: await tournaments.listAdmin(req.user, req.query) });
}));

router.post('/', validate(schemas.tournament.adminCreate), ah(async (req, res) => {
  res.status(201).json({ tournament: await tournaments.createAdmin(req.user, req.body, { ip: req.ip }) });
}));

router.patch('/:id', validate(schemas.tournament.adminUpdate), ah(async (req, res) => {
  res.json({ tournament: await tournaments.updateAdmin(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

router.delete('/:id', ah(async (req, res) => {
  res.json({ tournament: await tournaments.archiveAdmin(req.user, req.params.id, { ip: req.ip }) });
}));

router.get('/:id/divisions', validate(schemas.division.list, 'query'), ah(async (req, res) => {
  res.json({ divisions: await divisions.listTournamentDivisions(req.user, req.params.id) });
}));

router.post('/:id/divisions/sync', validate(schemas.division.sync), ah(async (req, res) => {
  res.json({ divisions: await divisions.syncTournamentDivisions(req.user, req.params.id, { ip: req.ip }) });
}));

module.exports = router;

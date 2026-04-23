const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const divisions = require('../services/match.service');
const exporter = require('../services/export.service');

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/:id/bracket', ah(async (req, res) => {
  res.json(await divisions.getDivisionBracket(req.user, req.params.id));
}));

router.post('/:id/generate-bracket', validate(schemas.division.generateBracket), ah(async (req, res) => {
  res.json(await divisions.generateDivisionBracket(req.user, req.params.id, req.body, { ip: req.ip }));
}));

router.post('/:id/manual-seeds', validate(schemas.division.manualSeeds), ah(async (req, res) => {
  res.json({ division: await divisions.setManualSeeds(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

router.get('/:id/bracket.pdf', ah(async (req, res) => {
  await exporter.divisionBracketToPdf(res, req.params.id, req.user, { ip: req.ip });
}));

module.exports = router;

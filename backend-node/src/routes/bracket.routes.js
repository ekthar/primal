const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const brackets = require('../services/bracket.service');
const exporter = require('../services/export.service');

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', validate(schemas.bracket.overview, 'query'), ah(async (req, res) => {
  res.json(await brackets.overview(req.user, req.query));
}));

router.post('/generate', validate(schemas.bracket.generate), ah(async (req, res) => {
  res.json({ bracket: await brackets.generate(req.user, req.body, { ip: req.ip }) });
}));

router.patch('/:id', validate(schemas.bracket.update), ah(async (req, res) => {
  res.json({ bracket: await brackets.update(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

router.post('/:id/advance', validate(schemas.bracket.advance), ah(async (req, res) => {
  res.json({ bracket: await brackets.advance(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

router.get('/:id.pdf', ah(async (req, res) => {
  await exporter.bracketToPdf(res, req.params.id, req.user, { ip: req.ip });
}));

module.exports = router;

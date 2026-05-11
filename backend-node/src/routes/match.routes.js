const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const matches = require('../services/match.service');

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/:id', ah(async (req, res) => {
  res.json(await matches.getMatchById(req.user, req.params.id));
}));

router.post('/:id/result', validate(schemas.match.result), ah(async (req, res) => {
  res.json(await matches.submitMatchResult(req.user, req.params.id, req.body, { ip: req.ip }));
}));

router.patch('/:id/notes', validate(schemas.match.notes), ah(async (req, res) => {
  res.json(await matches.setMatchNotes(req.user, req.params.id, req.body, { ip: req.ip }));
}));

module.exports = router;

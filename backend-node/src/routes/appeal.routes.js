const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const appeals = require('../services/appeal.service');

const router = Router();

router.post('/', requireAuth, validate(schemas.appeal.create), ah(async (req, res) => {
  res.status(201).json({ appeal: await appeals.file(req.user, req.body, { ip: req.ip }) });
}));

router.get('/open', requireAuth, requireRole('admin', 'reviewer'), ah(async (req, res) => {
  res.json({ appeals: await appeals.listOpen(req.user) });
}));

router.post('/:id/decision', requireAuth, requireRole('admin'),
  validate(schemas.appeal.decide), ah(async (req, res) => {
    res.json({ appeal: await appeals.decide(req.user, req.params.id, req.body, { ip: req.ip }) });
  })
);

module.exports = router;

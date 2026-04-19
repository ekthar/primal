const { Router } = require('express');
const { ah, validate, requireAuth } = require('../middleware');
const { schemas } = require('../validators');
const apps = require('../services/application.service');

const router = Router();

router.get('/', requireAuth, validate(schemas.queue.list, 'query'), ah(async (req, res) => {
  res.json({ items: await apps.listForMe(req.user, req.query) });
}));

router.post('/', requireAuth, validate(schemas.application.create), ah(async (req, res) => {
  res.status(201).json({ application: await apps.create(req.user, req.body, { ip: req.ip }) });
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  res.json({ application: await apps.getById(req.user, req.params.id) });
}));

router.patch('/:id', requireAuth, validate(schemas.application.update), ah(async (req, res) => {
  res.json({ application: await apps.updateDraft(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

router.post('/:id/submit', requireAuth, ah(async (req, res) => {
  res.json({ application: await apps.submit(req.user, req.params.id, { ip: req.ip }) });
}));

module.exports = router;

const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const profile = require('../services/profile.service');

const router = Router();

router.get('/me', requireAuth, ah(async (req, res) => {
  res.json({ profile: await profile.getMyProfile(req.user.id) });
}));

router.put('/me', requireAuth, validate(schemas.profile.upsert), ah(async (req, res) => {
  const p = await profile.upsertMyProfile(req.user.id, req.body, { ip: req.ip });
  res.json({ profile: p });
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  res.json({ profile: await profile.getProfileById(req.params.id) });
}));

router.get('/admin/reweigh/list', requireAuth, requireRole('admin'), validate(schemas.profile.adminReweighList, 'query'), ah(async (req, res) => {
  res.json({ items: await profile.listForAdminReweigh(req.user, req.query) });
}));

router.patch('/admin/reweigh/:id', requireAuth, requireRole('admin'), validate(schemas.profile.adminReweigh), ah(async (req, res) => {
  res.json({ profile: await profile.adminReweigh(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

module.exports = router;

const { Router } = require('express');
const { ah, requireAuth, requireRole, validate } = require('../middleware');
const { schemas } = require('../validators');
const circulars = require('../services/circular.service');

const router = Router();

// Admin: list all circulars
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  validate(schemas.circulars.listAdmin, 'query'),
  ah(async (req, res) => {
    const items = await circulars.listAdmin(req.user, req.query);
    res.json({ items });
  })
);

// Admin: create
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validate(schemas.circulars.create),
  ah(async (req, res) => {
    const circular = await circulars.create(req.user, req.body, { ip: req.ip });
    res.status(201).json({ circular });
  })
);

// Admin: update
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validate(schemas.circulars.update),
  ah(async (req, res) => {
    const circular = await circulars.update(req.user, req.params.id, req.body, { ip: req.ip });
    res.json({ circular });
  })
);

// Admin: soft delete
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  ah(async (req, res) => {
    const out = await circulars.remove(req.user, req.params.id, { ip: req.ip });
    res.json(out);
  })
);

module.exports = router;


const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const clubs = require('../services/club.service');

const router = Router();

router.post('/', requireAuth, validate(schemas.club.create), ah(async (req, res) => {
  res.status(201).json({ club: await clubs.createClub(req.user, req.body, { ip: req.ip }) });
}));

router.get('/', requireAuth, ah(async (req, res) => {
  res.json({ clubs: await clubs.listClubsForUser(req.user, req.query) });
}));

router.get('/trash', requireAuth, requireRole('admin'), ah(async (req, res) => {
  res.json({ clubs: await clubs.trashList(req.user, req.query) });
}));

router.patch('/:id', requireAuth, validate(schemas.club.update), ah(async (req, res) => {
  res.json({ club: await clubs.updateClub(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

router.delete('/:id', requireAuth, ah(async (req, res) => {
  res.json(await clubs.softDeleteClub(req.user, req.params.id, { ip: req.ip }));
}));

router.post('/:id/restore', requireAuth, requireRole('admin'), ah(async (req, res) => {
  res.json({ club: await clubs.restoreClub(req.user, req.params.id, { ip: req.ip }) });
}));

router.post('/:id/approve', requireAuth, requireRole('admin'), ah(async (req, res) => {
  res.json({ club: await clubs.approveClub(req.user, req.params.id, { ip: req.ip }) });
}));

module.exports = router;

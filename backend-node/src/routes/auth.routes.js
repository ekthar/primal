const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const auth = require('../services/auth.service');

const router = Router();

router.post('/register', validate(schemas.auth.register), ah(async (req, res) => {
  const out = await auth.register(req.body, { ip: req.ip });
  res.status(201).json(out);
}));

router.post('/login', validate(schemas.auth.login), ah(async (req, res) => {
  const out = await auth.login(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
  res.json(out);
}));

router.post('/google', validate(schemas.auth.google), ah(async (req, res) => {
  const out = await auth.loginWithGoogle(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
  res.json(out);
}));

router.post('/forgot-password', validate(schemas.auth.forgotPassword), ah(async (req, res) => {
  const out = await auth.requestPasswordReset(req.body, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    origin: req.get('origin'),
    referer: req.get('referer'),
  });
  res.json(out);
}));

router.post('/reset-password', validate(schemas.auth.resetPassword), ah(async (req, res) => {
  const out = await auth.resetPassword(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
  res.json(out);
}));

router.post('/refresh', validate(schemas.auth.refresh), ah(async (req, res) => {
  const out = await auth.refresh(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
  res.json(out);
}));

router.get('/me', requireAuth, ah(async (req, res) => {
  res.json({ user: await auth.me(req.user.id) });
}));

router.post('/logout', requireAuth, ah(async (req, res) => {
  res.json(await auth.logout(req.user, { refreshToken: req.body?.refreshToken }, { ip: req.ip }));
}));

router.get('/admin/users', requireAuth, requireRole('admin'), validate(schemas.auth.adminListUsers, 'query'), ah(async (req, res) => {
  res.json({ users: await auth.listUsersByAdmin(req.user, req.query) });
}));

router.post('/admin/users', requireAuth, requireRole('admin'), validate(schemas.auth.adminCreateUser), ah(async (req, res) => {
  res.status(201).json({ user: await auth.createUserByAdmin(req.user, req.body, { ip: req.ip }) });
}));

module.exports = router;

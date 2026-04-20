const { Router } = require('express');
const { ah, validate, requireAuth } = require('../middleware');
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

module.exports = router;

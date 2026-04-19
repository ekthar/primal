const { users: usersRepo } = require('../repositories');
const { hashPassword, verifyPassword, signAccess, signRefresh } = require('../security');
const { ApiError } = require('../apiError');
const { config } = require('../config');
const { write: auditWrite } = require('../audit');

async function register({ email, password, name, role, locale }, ctx = {}) {
  const existing = await usersRepo.findByEmail(email);
  if (existing) throw ApiError.conflict('Email already registered', { field: 'email' });
  const passwordHash = await hashPassword(password);
  const user = await usersRepo.create({ email, passwordHash, role, name, locale });
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'user.register',
    entityType: 'user', entityId: user.id, payload: { email, role }, requestIp: ctx.ip });
  return issueTokens(user);
}

async function login({ email, password }, ctx = {}) {
  const user = await usersRepo.findByEmail(email);
  if (!user || !user.password_hash) throw ApiError.unauthorized('Invalid credentials');
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  await usersRepo.touchLogin(user.id);
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'user.login',
    entityType: 'user', entityId: user.id, payload: { email }, requestIp: ctx.ip });
  return issueTokens(user);
}

async function loginWithGoogle({ idToken }, ctx = {}) {
  if (!config.google.clientId) throw ApiError.badRequest('Google OAuth not configured');
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(config.google.clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: config.google.clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email) throw ApiError.unauthorized('Invalid Google token');

  let user = await usersRepo.findByGoogleSub(payload.sub) || await usersRepo.findByEmail(payload.email);
  if (!user) {
    user = await usersRepo.create({
      email: payload.email,
      passwordHash: null,
      role: 'applicant',
      name: payload.name || payload.email.split('@')[0],
      googleSub: payload.sub,
      emailVerified: !!payload.email_verified,
      avatarUrl: payload.picture || null,
    });
  }
  await usersRepo.touchLogin(user.id);
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'user.login.google',
    entityType: 'user', entityId: user.id, payload: { email: payload.email }, requestIp: ctx.ip });
  return issueTokens(user);
}

function issueTokens(user) {
  return {
    user: publicUser(user),
    accessToken: signAccess({ id: user.id, role: user.role, email: user.email }),
    refreshToken: signRefresh({ id: user.id }),
  };
}

function publicUser(user) {
  return {
    id: user.id, email: user.email, role: user.role, name: user.name,
    locale: user.locale, avatarUrl: user.avatar_url, emailVerified: user.email_verified,
  };
}

async function me(userId) {
  const user = await usersRepo.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return publicUser(user);
}

module.exports = { register, login, loginWithGoogle, me, publicUser };

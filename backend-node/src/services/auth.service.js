const { users: usersRepo, sessions: sessionsRepo } = require('../repositories');
const { hashPassword, verifyPassword, signAccess, signRefresh, signPasswordReset, verifyToken } = require('../security');
const { ApiError } = require('../apiError');
const { config } = require('../config');
const { write: auditWrite } = require('../audit');
const { dispatch: notify } = require('../notifications');
const { createHash } = require('crypto');

function passwordHashFingerprint(passwordHash) {
  return createHash('sha256').update(String(passwordHash || '')).digest('hex').slice(0, 24);
}

function normalizeHttpOrigin(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function resolveResetBaseUrl(ctx = {}) {
  const configured = normalizeHttpOrigin(config.webBaseUrl);
  const fromOrigin = normalizeHttpOrigin(ctx.origin);
  const fromReferer = normalizeHttpOrigin(ctx.referer);

  if (config.env === 'production') {
    return configured || fromOrigin || fromReferer || 'http://localhost:3000';
  }

  // In local/staging, prefer caller origin when default localhost config is not accurate.
  if (!configured || configured === 'http://localhost:3000') {
    return fromOrigin || fromReferer || configured || 'http://localhost:3000';
  }

  return configured;
}

async function issuePasswordResetForUser(user, ctx = {}, { sendNotification = true } = {}) {
  const token = signPasswordReset({
    id: user.id,
    email: user.email,
    pwf: passwordHashFingerprint(user.password_hash),
  });
  const resetBaseUrl = resolveResetBaseUrl(ctx);
  const resetUrl = `${resetBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  if (sendNotification) {
    await notify({
      userId: user.id,
      channels: ['email'],
      to: { email: user.email },
      template: 'auth.password_reset',
      payload: { name: user.name, resetUrl },
    });
  }
  return { token, resetUrl };
}

async function register({ email, password, name, role, locale }, ctx = {}) {
  const existing = await usersRepo.findByEmail(email);
  if (existing) throw ApiError.conflict('Email already registered', { field: 'email' });
  const passwordHash = await hashPassword(password);
  const user = await usersRepo.create({ email, passwordHash, role, name, locale });
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'user.register',
    entityType: 'user', entityId: user.id, payload: { email, role }, requestIp: ctx.ip });
  return issueTokens(user, ctx);
}

async function login({ email, password }, ctx = {}) {
  const user = await usersRepo.findByEmail(email);
  if (!user || !user.password_hash) throw ApiError.unauthorized('Invalid credentials');
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  await usersRepo.touchLogin(user.id);
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'user.login',
    entityType: 'user', entityId: user.id, payload: { email }, requestIp: ctx.ip });
  return issueTokens(user, ctx);
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
  return issueTokens(user, ctx);
}

async function issueTokens(user, ctx = {}) {
  const refreshToken = signRefresh({ id: user.id });
  const decoded = verifyToken(refreshToken);
  await sessionsRepo.create({
    userId: user.id,
    refreshJti: decoded.jti,
    userAgent: ctx.userAgent || null,
    ip: ctx.ip || null,
    expiresAt: new Date(decoded.exp * 1000),
  });
  return {
    user: publicUser(user),
    accessToken: signAccess({ id: user.id, role: user.role, email: user.email }),
    refreshToken,
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

async function refresh({ refreshToken }, ctx = {}) {
  let decoded;
  try {
    decoded = verifyToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  if (decoded.type !== 'refresh' || !decoded.jti) throw ApiError.unauthorized('Wrong token type');
  const session = await sessionsRepo.findByJti(decoded.jti);
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() < Date.now()) {
    throw ApiError.unauthorized('Refresh session revoked');
  }
  const user = await usersRepo.findById(decoded.sub);
  if (!user) throw ApiError.unauthorized('User not found');
  await sessionsRepo.revokeByJti(decoded.jti);
  return issueTokens(user, ctx);
}

async function logout(user, { refreshToken } = {}, ctx = {}) {
  if (refreshToken) {
    try {
      const decoded = verifyToken(refreshToken);
      if (decoded.type === 'refresh' && decoded.jti) await sessionsRepo.revokeByJti(decoded.jti);
    } catch {
      // ignore invalid refresh token on logout
    }
  } else if (user?.id) {
    await sessionsRepo.revokeForUser(user.id);
  }
  if (user?.id) {
    await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'user.logout',
      entityType: 'user', entityId: user.id, payload: {}, requestIp: ctx.ip });
  }
  return { ok: true };
}

async function createUserByAdmin(actor, { email, password, name, role, locale }, ctx = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const existing = await usersRepo.findByEmail(email);
  if (existing) throw ApiError.conflict('Email already registered', { field: 'email' });
  const passwordHash = await hashPassword(password);
  const user = await usersRepo.create({ email, passwordHash, role, name, locale });
  await auditWrite({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'user.create_by_admin',
    entityType: 'user',
    entityId: user.id,
    payload: { role: user.role, email: user.email },
    requestIp: ctx.ip,
  });
  return publicUser(user);
}

async function listUsersByAdmin(actor, query = {}) {
  if (actor.role !== 'admin') throw ApiError.forbidden();
  const users = await usersRepo.list(query);
  return users.map(publicUser);
}

async function requestPasswordReset({ email }, ctx = {}) {
  const user = await usersRepo.findByEmail(email);
  let resetUrl = null;
  if (user) {
    const issued = await issuePasswordResetForUser(user, ctx);
    resetUrl = issued.resetUrl;
    await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'user.password_reset.request',
      entityType: 'user', entityId: user.id, payload: { email: user.email }, requestIp: ctx.ip });
  }

  const out = { ok: true };
  if (config.env !== 'production' && resetUrl) out.resetUrl = resetUrl;
  return out;
}

async function resetPassword({ token, newPassword }, ctx = {}) {
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired reset token');
  }
  if (decoded.type !== 'password_reset' || !decoded.sub || !decoded.pwf) {
    throw ApiError.unauthorized('Invalid reset token');
  }

  const user = await usersRepo.findById(decoded.sub);
  if (!user) throw ApiError.unauthorized('User not found');

  const expected = passwordHashFingerprint(user.password_hash);
  if (expected !== decoded.pwf) {
    throw ApiError.unauthorized('Reset token already used or expired');
  }

  const passwordHash = await hashPassword(newPassword);
  await usersRepo.updatePassword(user.id, passwordHash);
  await sessionsRepo.revokeForUser(user.id);
  await auditWrite({ actorUserId: user.id, actorRole: user.role, action: 'user.password_reset.complete',
    entityType: 'user', entityId: user.id, payload: {}, requestIp: ctx.ip });
  return { ok: true };
}

module.exports = {
  register,
  login,
  loginWithGoogle,
  me,
  refresh,
  logout,
  publicUser,
  createUserByAdmin,
  listUsersByAdmin,
  requestPasswordReset,
  resetPassword,
  issuePasswordResetForUser,
};

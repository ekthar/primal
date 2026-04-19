const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { config } = require('./config');

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, type: 'access' },
    config.jwt.secret,
    { expiresIn: config.jwt.accessTtl, issuer: 'tournamentos' }
  );
}
function signRefresh(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshTtl, issuer: 'tournamentos' }
  );
}
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, { issuer: 'tournamentos' });
}

module.exports = { hashPassword, verifyPassword, signAccess, signRefresh, verifyToken };

const crypto = require('crypto');
const { config } = require('./config');

const MAX_SIGNATURE_AGE_SECONDS = 365 * 24 * 60 * 60 * 5; // 5 years

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmacHex(input) {
  const secret = config.pdf?.signatureSecret || config.jwt.secret;
  return crypto.createHmac('sha256', secret).update(input).digest('hex');
}

function normalizeDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function digestApplication(app) {
  const payload = {
    id: app.id,
    profileId: app.profile_id,
    tournamentId: app.tournament_id,
    status: app.status,
    submittedAt: normalizeDate(app.submitted_at),
    reviewStartedAt: normalizeDate(app.review_started_at),
    decidedAt: normalizeDate(app.decided_at),
    updatedAt: normalizeDate(app.updated_at),
    reviewerId: app.reviewer_id || null,
    applicantName: `${app.first_name || ''} ${app.last_name || ''}`.trim(),
    discipline: app.discipline || null,
    weightClass: app.weight_class || null,
  };
  return sha256Hex(JSON.stringify(payload));
}

function signParts({ aid, dig, iat }) {
  return hmacHex(`${aid}.${dig}.${iat}`);
}

function buildSignatureForApplication(app) {
  const aid = app.id;
  const dig = digestApplication(app);
  const iat = Math.floor(Date.now() / 1000);
  const sig = signParts({ aid, dig, iat });

  const verifyBase = (config.pdf?.verifyBaseUrl || `${config.appBaseUrl}/api/public/verify/application-signature`).replace(/\/+$/, '');
  const url = `${verifyBase}?aid=${encodeURIComponent(aid)}&dig=${encodeURIComponent(dig)}&iat=${iat}&sig=${encodeURIComponent(sig)}`;

  return { aid, dig, iat, sig, url };
}

function safeEqualHex(a, b) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifySignatureForApplication(query, app) {
  const aid = String(query?.aid || '');
  const dig = String(query?.dig || '');
  const sig = String(query?.sig || '');
  const iatRaw = query?.iat;
  const iat = Number(iatRaw);

  if (!aid || !dig || !sig || !Number.isFinite(iat)) {
    return { valid: false, reason: 'Malformed signature query' };
  }
  if (aid !== app.id) {
    return { valid: false, reason: 'Application mismatch' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (iat > now + 300) {
    return { valid: false, reason: 'Issued-at is in the future' };
  }
  if (now - iat > MAX_SIGNATURE_AGE_SECONDS) {
    return { valid: false, reason: 'Signature expired' };
  }

  const expectedDig = digestApplication(app);
  if (!safeEqualHex(dig, expectedDig)) {
    return { valid: false, reason: 'Application content has changed', expectedDigest: expectedDig };
  }

  const expectedSig = signParts({ aid, dig, iat });
  if (!safeEqualHex(sig, expectedSig)) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  return {
    valid: true,
    reason: 'Signature verified',
    expectedDigest: expectedDig,
  };
}

module.exports = {
  buildSignatureForApplication,
  verifySignatureForApplication,
  digestApplication,
};

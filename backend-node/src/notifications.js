// Notification orchestration. Each channel has a send() that returns {providerRef, error?}.
// Channels degrade gracefully when creds are missing (status='skipped').
const { config } = require('./config');
const { query } = require('./db');
const { logger } = require('./logger');

let _resend; let _twilio;
function resend() {
  if (_resend) return _resend;
  if (!config.notifications.resendKey) return null;
  const { Resend } = require('resend');
  _resend = new Resend(config.notifications.resendKey);
  return _resend;
}
function twilio() {
  if (_twilio) return _twilio;
  if (!config.notifications.twilioSid || !config.notifications.twilioToken) return null;
  _twilio = require('twilio')(config.notifications.twilioSid, config.notifications.twilioToken);
  return _twilio;
}

// --- Templates (minimal — copy can be externalised to a CMS later) ---
const TEMPLATES = {
  'application.submitted': {
    subject: (p) => `Application received — ${p.applicantName}`,
    text: (p) => `Hi ${p.applicantName},\n\nWe received your application for ${p.tournamentName}. We'll review it within ${p.slaHours}h.\n\n— TournamentOS`,
  },
  'application.needs_correction': {
    subject: (p) => `Action needed on your application`,
    text: (p) => `Hi ${p.applicantName},\n\nThe reviewer has requested a correction:\n\n${p.reason}\n\nPlease update the flagged fields and resubmit before ${p.dueAt}.\n\n— TournamentOS`,
  },
  'application.approved': {
    subject: () => `You're in. Approved for weigh-in.`,
    text: (p) => `Congratulations ${p.applicantName} — your application for ${p.tournamentName} is approved. See you at weigh-in.\n\n— TournamentOS`,
  },
  'application.rejected': {
    subject: () => `Application decision`,
    text: (p) => `Hi ${p.applicantName},\n\nUnfortunately your application for ${p.tournamentName} was not approved. Reason: ${p.reason}\n\nYou can file an appeal within ${p.appealWindowDays} days.\n\n— TournamentOS`,
  },
  'auth.password_reset': {
    subject: () => 'Reset your password',
    text: (p) => `Hi ${p.name || 'there'},\n\nUse the link below to reset your password:\n${p.resetUrl}\n\nIf you did not request this, you can ignore this message.\n\n— TournamentOS`,
  },
};

async function sendEmail({ to, template, payload }) {
  const tpl = TEMPLATES[template];
  if (!tpl) return { status: 'skipped', error: `unknown template ${template}` };
  const r = resend();
  if (!r) return { status: 'skipped', error: 'resend-not-configured' };
  try {
    const { data, error } = await r.emails.send({
      from: config.notifications.resendFrom,
      to: [to],
      subject: tpl.subject(payload),
      text: tpl.text(payload),
    });
    if (error) return { status: 'failed', error: String(error.message || error) };
    return { status: 'sent', providerRef: data?.id };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

async function sendSms({ to, template, payload }) {
  const tpl = TEMPLATES[template];
  if (!tpl) return { status: 'skipped', error: `unknown template ${template}` };
  const t = twilio();
  if (!t || !config.notifications.smsFrom) return { status: 'skipped', error: 'twilio-sms-not-configured' };
  try {
    const msg = await t.messages.create({
      from: config.notifications.smsFrom,
      to,
      body: tpl.text(payload).slice(0, 640),
    });
    return { status: 'sent', providerRef: msg.sid };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

async function sendWhatsapp({ to, template, payload }) {
  const tpl = TEMPLATES[template];
  if (!tpl) return { status: 'skipped', error: `unknown template ${template}` };
  const t = twilio();
  if (!t || !config.notifications.whatsappFrom) return { status: 'skipped', error: 'twilio-whatsapp-not-configured' };
  try {
    const msg = await t.messages.create({
      from: config.notifications.whatsappFrom,
      to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
      body: tpl.text(payload).slice(0, 1000),
    });
    return { status: 'sent', providerRef: msg.sid };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

async function sendPush() {
  // Stub — FCM/APNs wiring left for follow-up.
  return { status: 'skipped', error: 'push-not-configured' };
}

const CHANNELS = { email: sendEmail, sms: sendSms, whatsapp: sendWhatsapp, push: sendPush };

/**
 * Dispatch a notification on all requested channels (in priority order).
 * Persists a row per channel. Non-throwing: failures are logged + stored.
 */
async function dispatch({ userId, applicationId, channels = ['email'], to, template, payload }) {
  let preferences = null;
  if (userId) {
    const { rows } = await query(`SELECT notification_preferences FROM users WHERE id = $1 LIMIT 1`, [userId]);
    preferences = rows[0]?.notification_preferences || null;
  }
  for (const channel of channels) {
    if (preferences && preferences[channel] === false) {
      await record({ userId, applicationId, channel, template, payload, status: 'skipped', error: 'disabled-by-preference' });
      continue;
    }
    const sender = CHANNELS[channel];
    if (!sender) continue;
    const target = typeof to === 'object' ? (to[channel] || to.email || to.phone) : to;
    if (!target) {
      await record({ userId, applicationId, channel, template, payload, status: 'skipped', error: 'no-target' });
      continue;
    }
    const result = await sender({ to: target, template, payload });
    await record({ userId, applicationId, channel, template, payload, ...result });
    if (result.status === 'sent') break; // stop at first successful delivery per priority
  }
}

async function record({ userId, applicationId, channel, template, payload, status, providerRef, error }) {
  try {
    await query(
      `INSERT INTO notifications (user_id, application_id, channel, template, payload, status, provider_ref, error, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $6 = 'sent' THEN NOW() ELSE NULL END)`,
      [userId || null, applicationId || null, channel, template, payload || {}, status, providerRef || null, error || null]
    );
  } catch (e) {
    logger.error({ e }, 'Failed to persist notification row');
  }
}

module.exports = { dispatch, TEMPLATES };

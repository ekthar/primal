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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailLayout({ eyebrow, title, body, ctaLabel, ctaUrl, footer }) {
  const ctaHtml = ctaLabel && ctaUrl
    ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#8c6a43;color:#f8f5ef;text-decoration:none;font-weight:700;">${escapeHtml(ctaLabel)}</a>`
    : '';

  return `
    <div style="margin:0;padding:32px;background:#f4f1ea;font-family:'Inter Tight',Arial,sans-serif;color:#1f2937;">
      <div style="max-width:640px;margin:0 auto;background:#fbfaf7;border:1px solid #d7d0c5;border-radius:24px;overflow:hidden;">
        <div style="padding:28px 32px;background:#8c6a43;color:#f8f5ef;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
          <div style="margin-top:10px;font-size:28px;font-weight:700;line-height:1.1;">Primal</div>
        </div>
        <div style="padding:32px;">
          <div style="font-family:'Manrope',Arial,sans-serif;font-size:24px;font-weight:700;line-height:1.2;">${escapeHtml(title)}</div>
          <div style="margin-top:16px;font-size:15px;line-height:1.7;">${body}</div>
          ${ctaHtml ? `<div style="margin-top:28px;">${ctaHtml}</div>` : ''}
        </div>
        <div style="padding:20px 32px;border-top:1px solid #ece6dc;background:#f8f5ef;font-size:12px;line-height:1.6;color:#5f6773;">
          ${footer}
        </div>
      </div>
    </div>
  `;
}

// --- Templates ---
const TEMPLATES = {
  'application.submitted': {
    subject: (p) => `Application received - ${p.applicantName}`,
    text: (p) => `Hi ${p.applicantName},\n\nWe received your application for ${p.tournamentName}. We'll review it within ${p.slaHours}h.\n\n- Primal`,
    html: (p) => renderEmailLayout({
      eyebrow: 'Application received',
      title: `Your registration is in review`,
      body: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(p.applicantName)},</p>
        <p style="margin:0 0 12px;">We received your application for <strong>${escapeHtml(p.tournamentName)}</strong>.</p>
        <p style="margin:0 0 12px;">Application ID: <strong>${escapeHtml(p.applicationDisplayId || 'Pending')}</strong></p>
        <p style="margin:0;">Review SLA: <strong>${escapeHtml(p.slaHours)} hours</strong>. We will notify you as soon as the decision is made.</p>
      `,
      footer: 'Primal operations will only contact you from approved channels. Keep this email for your registration reference.',
    }),
  },
  'application.needs_correction': {
    subject: () => 'Action needed on your application',
    text: (p) => `Primal: Action needed on application ${p.applicationDisplayId || ''}. Reason: ${p.reason || 'see email'}. Update & resubmit before ${p.dueAt || 'the deadline'}.`,
    html: (p) => renderEmailLayout({
      eyebrow: 'Action needed',
      title: 'We need a correction before we can proceed',
      body: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(p.applicantName)},</p>
        <p style="margin:0 0 12px;">The reviewer has flagged your application for <strong>${escapeHtml(p.tournamentName)}</strong> and requested an update.</p>
        <p style="margin:0 0 12px;">Application ID: <strong>${escapeHtml(p.applicationDisplayId || 'Pending')}</strong></p>
        <p style="margin:0 0 12px;"><strong>Reason:</strong><br>${escapeHtml(p.reason || '')}</p>
        <p style="margin:0;">Please update the flagged fields and resubmit before <strong>${escapeHtml(String(p.dueAt || 'the deadline'))}</strong>.</p>
      `,
      footer: 'You can update your application from your applicant dashboard. Contact operations if anything is unclear.',
    }),
  },
  'application.approved': {
    subject: () => "You're in. Approved for weigh-in.",
    text: (p) => `Primal: ${p.applicantName}, your application ${p.applicationDisplayId || ''} for ${p.tournamentName} is APPROVED. See you at weigh-in.`,
    html: (p) => renderEmailLayout({
      eyebrow: 'Application approved',
      title: 'Approved for the next stage',
      body: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(p.applicantName)},</p>
        <p style="margin:0 0 12px;">Your application for <strong>${escapeHtml(p.tournamentName)}</strong> has been approved.</p>
        <p style="margin:0 0 12px;">Application ID: <strong>${escapeHtml(p.applicationDisplayId || 'Pending')}</strong></p>
        <p style="margin:0;">Please proceed with weigh-in and event check-in using the instructions issued by Primal operations.</p>
      `,
      footer: 'Bring your approved documents and a valid photo ID to weigh-in. Contact operations if any participant details need correction before check-in.',
    }),
  },
  'application.rejected': {
    subject: () => 'Application decision',
    text: (p) => `Primal: ${p.applicantName}, your application ${p.applicationDisplayId || ''} for ${p.tournamentName} was not approved. Appeal window: ${p.appealWindowDays}d.`,
    html: (p) => renderEmailLayout({
      eyebrow: 'Application decision',
      title: 'Your application was not approved',
      body: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(p.applicantName)},</p>
        <p style="margin:0 0 12px;">After review, your application for <strong>${escapeHtml(p.tournamentName)}</strong> was not approved.</p>
        <p style="margin:0 0 12px;">Application ID: <strong>${escapeHtml(p.applicationDisplayId || 'Pending')}</strong></p>
        <p style="margin:0 0 12px;"><strong>Reason:</strong><br>${escapeHtml(p.reason || '')}</p>
        <p style="margin:0;">You can file an appeal within <strong>${escapeHtml(String(p.appealWindowDays || 7))} days</strong>. See your applicant dashboard for the appeal form.</p>
      `,
      footer: 'Thank you for applying. If you disagree with the decision, please raise an appeal within the window above.',
    }),
  },
  'auth.password_reset': {
    subject: () => 'Reset your password',
    text: (p) => `Hi ${p.name || 'there'},\n\nUse the link below to reset your password:\n${p.resetUrl}\n\nIf you did not request this, you can ignore this message.\n\n- Primal`,
    html: (p) => renderEmailLayout({
      eyebrow: 'Password reset',
      title: 'Reset your password',
      body: `
        <p style="margin:0 0 12px;">Hi ${escapeHtml(p.name || 'there')},</p>
        <p style="margin:0 0 12px;">A password reset was requested for your Primal account.</p>
        <p style="margin:0;">Use the secure button below to choose a new password. This link expires automatically.</p>
      `,
      ctaLabel: 'Reset password',
      ctaUrl: p.resetUrl,
      footer: 'If you did not request this reset, you can ignore this message. Your current password will remain unchanged until the reset is completed.',
    }),
  },
};

async function sendEmail({ to, template, payload }) {
  const tpl = TEMPLATES[template];
  if (!tpl) return { status: 'skipped', error: `unknown template ${template}` };
  const r = resend();
  if (!r) return { status: 'skipped', error: 'resend-not-configured' };

  let attempt = 0;
  const maxAttempts = config.notifications.resendRetries + 1;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const { data, error } = await r.emails.send({
        from: config.notifications.resendFrom,
        to: [to],
        subject: tpl.subject(payload),
        text: tpl.text(payload),
        html: tpl.html ? tpl.html(payload) : undefined,
      });
      if (error) {
        lastError = String(error.message || error);
        logger.warn({
          channel: 'email',
          template,
          targetType: 'email',
          target: to,
          provider: 'resend',
          attempt,
          providerError: lastError,
        }, 'Email notification attempt failed');
      } else {
        return { status: 'sent', providerRef: data?.id };
      }
    } catch (err) {
      lastError = err.message;
      logger.warn({
        channel: 'email',
        template,
        targetType: 'email',
        target: to,
        provider: 'resend',
        attempt,
        providerError: lastError,
      }, 'Email notification attempt threw');
    }
  }

  return { status: 'failed', error: lastError || 'unknown-email-error' };
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
    logger.warn({
      channel: 'sms',
      template,
      targetType: 'phone',
      target: to,
      provider: 'twilio',
      providerError: err.message,
    }, 'SMS notification failed');
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
    logger.warn({
      channel: 'whatsapp',
      template,
      targetType: 'phone',
      target: to,
      provider: 'twilio',
      providerError: err.message,
    }, 'WhatsApp notification failed');
    return { status: 'failed', error: err.message };
  }
}

async function sendPush() {
  // Stub - FCM/APNs wiring left for follow-up.
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
    if (result.status === 'failed') {
      logger.warn({
        userId,
        applicationId,
        channel,
        template,
        targetType: channel === 'email' ? 'email' : 'phone',
        providerError: result.error || null,
      }, 'Notification delivery failed');
    }
    if (result.status === 'sent') break;
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

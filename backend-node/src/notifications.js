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

function present(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function renderWhatsappLayout({ title, greeting, intro, fields, action, footer }) {
  const visibleFields = fields
    .map((field) => ({ label: field.label, value: present(field.value, '') }))
    .filter((field) => field.value);
  const detailBlock = visibleFields.length
    ? `\n\n*Details*\n${visibleFields.map((field) => `- ${field.label}: ${field.value}`).join('\n')}`
    : '';
  const actionBlock = action ? `\n\n*Next step*\n${action}` : '';
  const footerBlock = footer ? `\n\n${footer}` : '\n\n- Primal Operations';

  return `*Primal*\n*${title}*\n\n${greeting}\n${intro}${detailBlock}${actionBlock}${footerBlock}`;
}

function renderSimpleEmail({ eyebrow, title, intro, fields, action }) {
  const fieldHtml = fields
    .filter((field) => present(field.value, ''))
    .map((field) => `<p style="margin:0 0 10px;"><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(field.value)}</p>`)
    .join('');

  return renderEmailLayout({
    eyebrow,
    title,
    body: `
      <p style="margin:0 0 12px;">${escapeHtml(intro)}</p>
      ${fieldHtml}
      ${action ? `<p style="margin:0;">${escapeHtml(action)}</p>` : ''}
    `,
    footer: 'Primal operations will only contact you from approved channels.',
  });
}

function createOperationalTemplate({ subject, title, intro, fields, action }) {
  return {
    subject: (p) => subject(p),
    text: (p) => {
      const visibleFields = fields(p)
        .filter((field) => present(field.value, ''))
        .map((field) => `${field.label}: ${field.value}`)
        .join('\n');
      return [
        `Primal: ${title(p)}`,
        intro(p),
        visibleFields,
        action ? action(p) : '',
      ].filter(Boolean).join('\n\n');
    },
    html: (p) => renderSimpleEmail({
      eyebrow: subject(p),
      title: title(p),
      intro: intro(p),
      fields: fields(p),
      action: action ? action(p) : '',
    }),
    whatsappText: (p) => renderWhatsappLayout({
      title: title(p),
      greeting: `Hi ${present(p.recipientName || p.applicantName || p.clubName, 'there')},`,
      intro: intro(p),
      fields: fields(p),
      action: action ? action(p) : '',
    }),
  };
}

// --- Templates ---
const TEMPLATES = {
  'application.submitted': {
    subject: (p) => `Application received - ${p.applicantName}`,
    text: (p) => `Hi ${p.applicantName},\n\nWe received your application for ${p.tournamentName}. We'll review it within ${p.slaHours}h.\n\n- Primal`,
    whatsappText: (p) => renderWhatsappLayout({
      title: 'Application received',
      greeting: `Hi ${present(p.applicantName, 'there')},`,
      intro: `Your registration for ${present(p.tournamentName, 'the tournament')} is in review.`,
      fields: [
        { label: 'Application', value: p.applicationDisplayId || 'Pending' },
        { label: 'Review SLA', value: `${present(p.slaHours, '48')} hours` },
      ],
      action: 'We will message you as soon as the review team updates your application.',
    }),
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
    whatsappText: (p) => renderWhatsappLayout({
      title: 'Correction required',
      greeting: `Hi ${present(p.applicantName, 'there')},`,
      intro: `Your application for ${present(p.tournamentName, 'the tournament')} needs an update before review can continue.`,
      fields: [
        { label: 'Application', value: p.applicationDisplayId },
        { label: 'Reason', value: p.reason || 'See your dashboard' },
        { label: 'Due by', value: p.dueAt || 'Deadline shown in dashboard' },
      ],
      action: 'Open your Primal dashboard, update the flagged details, and resubmit.',
    }),
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
    whatsappText: (p) => renderWhatsappLayout({
      title: 'Application approved',
      greeting: `Hi ${present(p.applicantName, 'there')},`,
      intro: `You are approved for ${present(p.tournamentName, 'the tournament')}.`,
      fields: [
        { label: 'Application', value: p.applicationDisplayId },
        { label: 'Status', value: 'Approved' },
      ],
      action: 'Bring your approved documents and a valid photo ID to weigh-in.',
    }),
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
    whatsappText: (p) => renderWhatsappLayout({
      title: 'Application decision',
      greeting: `Hi ${present(p.applicantName, 'there')},`,
      intro: `Your application for ${present(p.tournamentName, 'the tournament')} was not approved.`,
      fields: [
        { label: 'Application', value: p.applicationDisplayId },
        { label: 'Reason', value: p.reason || 'See your dashboard' },
        { label: 'Appeal window', value: `${present(p.appealWindowDays, '7')} days` },
      ],
      action: 'If you disagree with the decision, raise an appeal from your Primal dashboard.',
    }),
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
    whatsappText: (p) => renderWhatsappLayout({
      title: 'Password reset',
      greeting: `Hi ${present(p.name, 'there')},`,
      intro: 'A password reset was requested for your Primal account.',
      fields: [
        { label: 'Reset link', value: p.resetUrl },
      ],
      action: 'Use this link only if you requested the reset. Otherwise ignore this message.',
    }),
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
  'auth.registered': createOperationalTemplate({
    subject: () => 'Welcome to Primal',
    title: () => 'Account created',
    intro: (p) => `Your ${present(p.role, 'Primal')} account is ready.`,
    fields: (p) => [
      { label: 'Login', value: p.email },
      { label: 'Role', value: p.role },
    ],
    action: () => 'Sign in to Primal and complete your profile before registration closes.',
  }),
  'club.account_created': createOperationalTemplate({
    subject: () => 'Club account created',
    title: () => 'Club account ready',
    intro: () => 'Your Primal club manager account is ready.',
    fields: (p) => [
      { label: 'Club', value: p.clubName },
      { label: 'Login', value: p.email },
      { label: 'Club code', value: p.clubCode },
    ],
    action: () => 'Sign in and complete your club profile, roster, and fighter details.',
  }),
  'club.created': createOperationalTemplate({
    subject: () => 'Club submitted',
    title: () => 'Club profile created',
    intro: () => 'Your club profile has been created in Primal.',
    fields: (p) => [
      { label: 'Club', value: p.clubName },
      { label: 'Club code', value: p.clubCode },
      { label: 'City', value: p.city },
      { label: 'Status', value: p.status || 'Pending' },
    ],
    action: () => 'You can now manage your roster from the club dashboard.',
  }),
  'club.approved': createOperationalTemplate({
    subject: () => 'Club approved',
    title: () => 'Club approved',
    intro: () => 'Your club is active on Primal.',
    fields: (p) => [
      { label: 'Club', value: p.clubName },
      { label: 'Club code', value: p.clubCode },
      { label: 'Status', value: 'Active' },
    ],
    action: () => 'Add fighters, keep profiles updated, and submit tournament applications from the dashboard.',
  }),
  'club.updated': createOperationalTemplate({
    subject: () => 'Club updated',
    title: () => 'Club profile updated',
    intro: () => 'Your club profile was updated.',
    fields: (p) => [
      { label: 'Club', value: p.clubName },
      { label: 'Club code', value: p.clubCode },
      { label: 'Updated fields', value: p.updatedFields },
    ],
    action: () => 'Review the changes in your club dashboard.',
  }),
  'club.deactivated': createOperationalTemplate({
    subject: () => 'Club deactivated',
    title: () => 'Club deactivated',
    intro: () => 'Your club profile has been deactivated.',
    fields: (p) => [
      { label: 'Club', value: p.clubName },
      { label: 'Club code', value: p.clubCode },
    ],
    action: () => 'Contact Primal operations if this was unexpected.',
  }),
  'club.restored': createOperationalTemplate({
    subject: () => 'Club restored',
    title: () => 'Club restored',
    intro: () => 'Your club profile is active again.',
    fields: (p) => [
      { label: 'Club', value: p.clubName },
      { label: 'Club code', value: p.clubCode },
    ],
    action: () => 'You can continue managing roster and registrations from the dashboard.',
  }),
  'club.participant_created': createOperationalTemplate({
    subject: () => 'Fighter added to club',
    title: () => 'Fighter profile created',
    intro: (p) => `${present(p.participantName, 'A fighter')} has been added to ${present(p.clubName, 'your club')}.`,
    fields: (p) => [
      { label: 'Fighter', value: p.participantName },
      { label: 'Fighter code', value: p.fighterCode },
      { label: 'Club', value: p.clubName },
      { label: 'Login', value: p.email },
      { label: 'Reset link', value: p.resetUrl },
    ],
    action: () => 'Complete missing profile details before submitting tournament applications.',
  }),
  'club.participant_updated': createOperationalTemplate({
    subject: () => 'Fighter profile updated',
    title: () => 'Fighter profile updated',
    intro: (p) => `${present(p.participantName, 'A fighter')} was updated in ${present(p.clubName, 'your club')}.`,
    fields: (p) => [
      { label: 'Fighter', value: p.participantName },
      { label: 'Fighter code', value: p.fighterCode },
      { label: 'Club', value: p.clubName },
    ],
    action: () => 'Check the roster before submitting or resubmitting applications.',
  }),
  'club.participant_reset_link': createOperationalTemplate({
    subject: () => 'Fighter reset link issued',
    title: () => 'Reset link issued',
    intro: (p) => `A reset link was issued for ${present(p.participantName, 'the fighter')}.`,
    fields: (p) => [
      { label: 'Fighter', value: p.participantName },
      { label: 'Fighter code', value: p.fighterCode },
      { label: 'Login', value: p.email },
      { label: 'Reset link', value: p.resetUrl },
    ],
    action: () => 'Share this only with the intended fighter.',
  }),
  'application.resubmitted': createOperationalTemplate({
    subject: () => 'Application resubmitted',
    title: () => 'Correction resubmitted',
    intro: (p) => `Your corrected application for ${present(p.tournamentName, 'the tournament')} has been resubmitted.`,
    fields: (p) => [
      { label: 'Application', value: p.applicationDisplayId },
      { label: 'Status', value: 'Submitted' },
    ],
    action: () => 'The review team will check the updated details.',
  }),
  'application.under_review': createOperationalTemplate({
    subject: () => 'Application under review',
    title: () => 'Review started',
    intro: (p) => `Your application for ${present(p.tournamentName, 'the tournament')} is now under review.`,
    fields: (p) => [
      { label: 'Application', value: p.applicationDisplayId },
      { label: 'Status', value: 'Under review' },
    ],
    action: () => 'No action is needed unless the review team requests a correction.',
  }),
  'application.reopened': createOperationalTemplate({
    subject: () => 'Application reopened',
    title: () => 'Application reopened',
    intro: (p) => `Your application for ${present(p.tournamentName, 'the tournament')} has been reopened for review.`,
    fields: (p) => [
      { label: 'Application', value: p.applicationDisplayId },
      { label: 'Reason', value: p.reason },
    ],
    action: () => 'Watch your dashboard for the next review decision.',
  }),
  'appeal.submitted': createOperationalTemplate({
    subject: () => 'Appeal submitted',
    title: () => 'Appeal received',
    intro: (p) => `Your appeal for ${present(p.tournamentName, 'the tournament')} has been received.`,
    fields: (p) => [
      { label: 'Application', value: p.applicationDisplayId },
      { label: 'Reason', value: p.reason },
    ],
    action: () => 'Primal operations will review the appeal and update your application.',
  }),
  'appeal.accepted': createOperationalTemplate({
    subject: () => 'Appeal accepted',
    title: () => 'Appeal accepted',
    intro: () => 'Your appeal has been accepted and the application is back in review.',
    fields: (p) => [
      { label: 'Application', value: p.applicationDisplayId },
      { label: 'Tournament', value: p.tournamentName },
    ],
    action: () => 'Watch your dashboard for the final review decision.',
  }),
  'appeal.rejected': createOperationalTemplate({
    subject: () => 'Appeal decision',
    title: () => 'Appeal not accepted',
    intro: () => 'Your appeal was reviewed and not accepted.',
    fields: (p) => [
      { label: 'Application', value: p.applicationDisplayId },
      { label: 'Tournament', value: p.tournamentName },
      { label: 'Reason', value: p.reason },
    ],
    action: () => 'Contact Primal operations only if you need clarification on the decision.',
  }),
  'tournament.registration_opened': createOperationalTemplate({
    subject: () => 'Registration opened',
    title: () => 'Registration is open',
    intro: (p) => `${present(p.tournamentName, 'Tournament')} registration is open.`,
    fields: (p) => [
      { label: 'Tournament', value: p.tournamentName },
      { label: 'Closes on', value: p.registrationClosesAt },
    ],
    action: () => 'Submit fighter applications before the registration window closes.',
  }),
  'tournament.registration_closing_soon': createOperationalTemplate({
    subject: () => 'Registration closing soon',
    title: () => 'Registration closing soon',
    intro: (p) => `${present(p.tournamentName, 'Tournament')} registration is closing soon.`,
    fields: (p) => [
      { label: 'Tournament', value: p.tournamentName },
      { label: 'Closes on', value: p.registrationClosesAt },
    ],
    action: () => 'Submit pending applications and corrections as soon as possible.',
  }),
  'tournament.registration_closed': createOperationalTemplate({
    subject: () => 'Registration closed',
    title: () => 'Registration closed',
    intro: (p) => `${present(p.tournamentName, 'Tournament')} registration is now closed.`,
    fields: (p) => [
      { label: 'Tournament', value: p.tournamentName },
    ],
    action: () => 'Only Primal operations can make further registration changes.',
  }),
  'weighin.reminder': createOperationalTemplate({
    subject: () => 'Weigh-in reminder',
    title: () => 'Weigh-in reminder',
    intro: (p) => `Weigh-in is upcoming for ${present(p.tournamentName, 'the tournament')}.`,
    fields: (p) => [
      { label: 'Fighter', value: p.participantName || p.applicantName },
      { label: 'Time', value: p.weighInAt },
      { label: 'Venue', value: p.venue },
    ],
    action: () => 'Bring valid ID and required documents.',
  }),
  'weighin.completed': createOperationalTemplate({
    subject: () => 'Weigh-in completed',
    title: () => 'Weigh-in completed',
    intro: () => 'Your weigh-in has been recorded.',
    fields: (p) => [
      { label: 'Fighter', value: p.participantName || p.applicantName },
      { label: 'Weight', value: p.weightKg ? `${p.weightKg} kg` : '' },
      { label: 'Status', value: p.status },
    ],
    action: () => 'Follow event staff instructions for the next step.',
  }),
  'weighin.failed': createOperationalTemplate({
    subject: () => 'Weigh-in issue',
    title: () => 'Weigh-in issue',
    intro: () => 'There is an issue with your weigh-in record.',
    fields: (p) => [
      { label: 'Fighter', value: p.participantName || p.applicantName },
      { label: 'Weight', value: p.weightKg ? `${p.weightKg} kg` : '' },
      { label: 'Reason', value: p.reason },
    ],
    action: () => 'Contact the weigh-in desk immediately.',
  }),
  'bracket.published': createOperationalTemplate({
    subject: () => 'Bracket published',
    title: () => 'Bracket published',
    intro: (p) => `The bracket for ${present(p.tournamentName, 'the tournament')} is published.`,
    fields: (p) => [
      { label: 'Division', value: p.divisionName },
      { label: 'First match', value: p.firstMatch },
    ],
    action: () => 'Check your dashboard and report to the marshal on time.',
  }),
  'circular.published': createOperationalTemplate({
    subject: () => 'New Primal circular',
    title: () => 'New circular published',
    intro: (p) => present(p.circularTitle, 'A new Primal circular has been published.'),
    fields: (p) => [
      { label: 'Topic', value: p.circularTitle },
      { label: 'Applies to', value: p.audience },
    ],
    action: (p) => p.ctaUrl ? `Read it here: ${p.ctaUrl}` : 'Open Primal for the full circular.',
  }),
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
  const body = tpl.whatsappText ? tpl.whatsappText(payload) : tpl.text(payload);
  try {
    const msg = await t.messages.create({
      from: config.notifications.whatsappFrom,
      to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
      body: body.slice(0, 1000),
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

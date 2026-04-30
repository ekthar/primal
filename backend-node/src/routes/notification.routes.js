const { Router } = require('express');
const { ah, requireAuth, requireRole } = require('../middleware');
const { config } = require('../config');
const { dispatch, TEMPLATES } = require('../notifications');
const { applications: appsRepo, users: usersRepo } = require('../repositories');
const { formatPersonName, applicationDisplayId } = require('../services/identity.service');
const { write: auditWrite } = require('../audit');
const { query } = require('../db');

const router = Router();

const whatsappPreviewPayload = {
  recipientName: 'Arjun',
  applicantName: 'Arjun Rao',
  participantName: 'Arjun Rao',
  clubName: 'Primal Combat Club',
  clubCode: 'CLB-PRIMAL01',
  fighterCode: 'FIG-PRIMAL01',
  applicationDisplayId: 'APP-2026-0001',
  tournamentName: 'Primal Fight Series',
  divisionName: 'MMA Senior 70 kg',
  email: 'fighter@example.com',
  role: 'applicant',
  city: 'Kochi',
  status: 'Active',
  reason: 'Medical document needs a clearer upload',
  dueAt: '2026-05-02 18:00',
  appealWindowDays: 7,
  slaHours: 48,
  resetUrl: 'https://primal.example/reset-password',
  registrationClosesAt: '2026-05-10 23:59',
  weighInAt: '2026-05-18 08:00',
  venue: 'Primal Arena',
  weightKg: 69.8,
  firstMatch: 'Mat 1, Bout 4',
  circularTitle: 'Weigh-in and document circular',
  audience: 'All registered fighters',
  ctaUrl: 'https://primal.example/circulars',
  updatedFields: 'city, contact number',
};

function buildWhatsappTemplatePreviews() {
  return Object.entries(TEMPLATES)
    .filter(([, template]) => typeof template.whatsappText === 'function')
    .map(([key, template]) => ({
      key,
      preview: template.whatsappText(whatsappPreviewPayload),
    }));
}

// Health panel — shows which channels are wired without leaking secrets.
router.get('/health', requireAuth, requireRole('admin'), ah(async (_req, res) => {
  const { rows } = await query(`
    SELECT channel, status, COUNT(*)::int AS count
    FROM notifications
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY channel, status
  `);
  const recent = {};
  for (const row of rows) {
    recent[row.channel] = recent[row.channel] || {};
    recent[row.channel][row.status] = row.count;
  }
  res.json({
    email: {
      provider: 'resend',
      configured: !!config.notifications.resendKey,
      from: config.notifications.resendFrom || null,
      retries: config.notifications.resendRetries ?? 0,
    },
    sms: {
      provider: 'twilio',
      configured: !!(config.notifications.twilioSid && config.notifications.twilioToken),
      from: config.notifications.smsFrom || null,
    },
    whatsapp: {
      provider: 'twilio',
      configured: !!(config.notifications.twilioSid && config.notifications.twilioToken && config.notifications.whatsappFrom),
      from: config.notifications.whatsappFrom || null,
    },
    push: {
      provider: 'fcm',
      configured: false,
      note: 'FCM/APNs wiring is a follow-up',
    },
    templates: Object.keys(TEMPLATES),
    whatsappTemplates: buildWhatsappTemplatePreviews(),
    recent,
  });
}));

async function resendForApplication(req, res) {
  const { applicationId } = req.params;
  const channels = Array.isArray(req.body?.channels) && req.body.channels.length
    ? req.body.channels.filter((c) => ['email', 'sms', 'whatsapp', 'push'].includes(c))
    : ['whatsapp', 'email', 'sms'];
  if (!channels.length) {
    return res.status(400).json({ error: 'no_valid_channels', hint: 'Allowed: email, sms, whatsapp, push' });
  }
  const template = String(req.body?.template || '').trim();
  if (!TEMPLATES[template]) {
    return res.status(400).json({ error: 'invalid_template', templates: Object.keys(TEMPLATES) });
  }

  const app = await appsRepo.findFullById(applicationId);
  if (!app) return res.status(404).json({ error: 'application_not_found' });
  const user = app.submitted_by ? await usersRepo.findById(app.submitted_by) : null;
  if (!user) return res.status(404).json({ error: 'applicant_not_found' });

  await dispatch({
    userId: user.id,
    applicationId: app.id,
    channels,
    to: { email: user.email, phone: user.phone, whatsapp: user.phone },
    template,
    payload: {
      applicantName: formatPersonName(app.first_name, app.last_name),
      applicationDisplayId: applicationDisplayId(app.id),
      tournamentName: app.tournament_name,
      reason: req.body?.reason || app.review_notes || '',
      dueAt: app.correction_due_at,
      appealWindowDays: config.workflow.appealWindowDays,
      slaHours: config.workflow.reviewSlaHours,
    },
  });

  await auditWrite({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    action: 'notification.resend',
    entityType: 'application',
    entityId: app.id,
    payload: { template, channels },
    requestIp: req.ip,
  });

  res.json({ ok: true, template, channels });
}

// Resend a notification for a given application. Admin-only.
router.post('/resend/:applicationId', requireAuth, requireRole('admin'), ah(resendForApplication));

// Backward-compatible alias used by some frontend builds.
router.post('/:applicationId/resend', requireAuth, requireRole('admin'), ah(resendForApplication));

module.exports = router;

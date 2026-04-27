const { Router } = require('express');
const Joi = require('joi');
const { ah, requireAuth, requireRole, validate } = require('../middleware');
const webhookService = require('../services/webhook.service');
const { write: auditWrite } = require('../audit');

const router = Router();

const subscriptionSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  events: Joi.array().items(Joi.string().valid(...webhookService.WEBHOOK_EVENTS)).default([]),
  isActive: Joi.boolean().default(true),
});

const subscriptionPatchSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  url: Joi.string().uri({ scheme: ['http', 'https'] }),
  events: Joi.array().items(Joi.string().valid(...webhookService.WEBHOOK_EVENTS)),
  isActive: Joi.boolean(),
}).min(1);

router.use(requireAuth, requireRole('admin'));

router.get('/events', ah(async (_req, res) => {
  res.json({ events: webhookService.WEBHOOK_EVENTS });
}));

router.get('/', ah(async (_req, res) => {
  res.json({ subscriptions: await webhookService.listSubscriptions() });
}));

router.post('/', validate(subscriptionSchema), ah(async (req, res) => {
  const subscription = await webhookService.createSubscription({ ...req.body, createdBy: req.user.id });
  await auditWrite({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    action: 'webhook.create',
    entityType: 'webhook_subscription',
    entityId: subscription.id,
    payload: { name: subscription.name, url: subscription.url, events: subscription.events },
  });
  res.status(201).json({ subscription });
}));

router.patch('/:id', validate(subscriptionPatchSchema), ah(async (req, res) => {
  const subscription = await webhookService.updateSubscription(req.params.id, req.body);
  if (!subscription) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'webhook not found' } });
  await auditWrite({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    action: 'webhook.update',
    entityType: 'webhook_subscription',
    entityId: req.params.id,
    payload: req.body,
  });
  res.json({ subscription });
}));

router.delete('/:id', ah(async (req, res) => {
  await webhookService.removeSubscription(req.params.id);
  await auditWrite({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    action: 'webhook.delete',
    entityType: 'webhook_subscription',
    entityId: req.params.id,
  });
  res.json({ ok: true });
}));

router.get('/:id/deliveries', ah(async (req, res) => {
  const deliveries = await webhookService.listDeliveries(req.params.id, { limit: 50 });
  res.json({ deliveries });
}));

router.post('/:id/test', ah(async (req, res) => {
  const event = req.body?.event || 'application.approved';
  const result = await webhookService.emitToSubscription(req.params.id, event, {
    test: true, triggeredBy: req.user.id,
  });
  if (result.reason === 'not_found') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'webhook not found' } });
  }
  res.json(result);
}));

module.exports = router;

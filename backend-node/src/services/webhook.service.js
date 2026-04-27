const crypto = require('crypto');
const { webhookSubscriptions, webhookDeliveries } = require('../repositories');
const { logger } = require('../logger');

const WEBHOOK_EVENTS = [
  'application.submitted',
  'application.approved',
  'application.rejected',
  'application.needs_correction',
  'tournament.opened',
  'tournament.closed',
  'weighin.recorded',
  'match.result',
  'album.published',
];

const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 8000;

function backoffMs(attempt) {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

function signPayload(secret, payloadString) {
  return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
}

function mapSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: row.events || [],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    secretPreview: row.secret ? `${row.secret.slice(0, 4)}…${row.secret.slice(-4)}` : null,
  };
}

function mapDelivery(row) {
  if (!row) return null;
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    event: row.event,
    payload: row.payload,
    status: row.status,
    attemptCount: row.attempt_count,
    responseCode: row.response_code,
    errorMessage: row.error_message,
    nextRetryAt: row.next_retry_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  };
}

async function listSubscriptions() {
  const rows = await webhookSubscriptions.list();
  return rows.map(mapSubscription);
}

async function createSubscription({ name, url, events = [], isActive = true, createdBy = null, secret = null }) {
  const finalSecret = secret || crypto.randomBytes(24).toString('hex');
  const filtered = (events || []).filter((e) => WEBHOOK_EVENTS.includes(e));
  const row = await webhookSubscriptions.create({ name, url, secret: finalSecret, events: filtered, isActive, createdBy });
  return { ...mapSubscription(row), secret: finalSecret };
}

async function updateSubscription(id, patch) {
  const filteredEvents = patch.events
    ? patch.events.filter((e) => WEBHOOK_EVENTS.includes(e))
    : undefined;
  const row = await webhookSubscriptions.update(id, {
    name: patch.name,
    url: patch.url,
    events: filteredEvents,
    isActive: patch.isActive,
  });
  return mapSubscription(row);
}

async function removeSubscription(id) {
  await webhookSubscriptions.remove(id);
  return { ok: true };
}

async function listDeliveries(subscriptionId, options = {}) {
  const rows = await webhookDeliveries.listForSubscription(subscriptionId, options);
  return rows.map(mapDelivery);
}

async function deliverOne(subscription, delivery) {
  const payloadString = JSON.stringify(delivery.payload);
  const signature = signPayload(subscription.secret, payloadString);
  const attempt = (delivery.attempt_count || 0) + 1;
  let responseCode = null;
  let responseBody = null;
  let errorMessage = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(subscription.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-primal-event': delivery.event,
        'x-primal-delivery': delivery.id,
        'x-primal-signature': `sha256=${signature}`,
      },
      body: payloadString,
      signal: controller.signal,
    });
    clearTimeout(timer);
    responseCode = res.status;
    try {
      const text = await res.text();
      responseBody = text ? text.slice(0, 1024) : null;
    } catch { /* response body unreadable */ }
    if (res.ok) {
      await webhookDeliveries.markResult(delivery.id, {
        status: 'success', responseCode, responseBody, attemptCount: attempt,
      });
      return { ok: true, status: 'success' };
    }
    errorMessage = `HTTP ${responseCode}`;
  } catch (err) {
    errorMessage = err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err));
  }

  if (attempt >= MAX_ATTEMPTS) {
    await webhookDeliveries.markResult(delivery.id, {
      status: 'failed', responseCode, responseBody, errorMessage, attemptCount: attempt,
    });
    return { ok: false, status: 'failed' };
  }
  const nextRetryAt = new Date(Date.now() + backoffMs(attempt));
  await webhookDeliveries.markResult(delivery.id, {
    status: 'retry', responseCode, responseBody, errorMessage, nextRetryAt, attemptCount: attempt,
  });
  return { ok: false, status: 'retry' };
}

async function emit(event, payload) {
  if (!WEBHOOK_EVENTS.includes(event)) {
    logger.warn({ event }, 'webhook.emit unknown event');
    return { delivered: 0 };
  }
  const subs = await webhookSubscriptions.listActiveForEvent(event);
  if (!subs.length) return { delivered: 0 };
  const enriched = { event, emittedAt: new Date().toISOString(), data: payload };
  let delivered = 0;
  for (const sub of subs) {
    try {
      const delivery = await webhookDeliveries.create({
        subscriptionId: sub.id, event, payload: enriched,
      });
      const result = await deliverOne(sub, delivery);
      if (result.ok) delivered += 1;
    } catch (err) {
      logger.warn({ err, subscriptionId: sub.id, event }, 'webhook.emit failed');
    }
  }
  return { delivered };
}

function emitAsync(event, payload) {
  emit(event, payload).catch((err) => logger.warn({ err, event }, 'webhook.emitAsync error'));
}

/**
 * Send a single test/triggered event to ONE subscription only. Used by the
 * admin "Test" button so an operator can verify a specific endpoint without
 * fanning the synthetic payload out to every other subscription listening
 * for the same event in production.
 */
async function emitToSubscription(subscriptionId, event, payload) {
  const sub = await webhookSubscriptions.findById(subscriptionId);
  if (!sub) return { ok: false, reason: 'not_found' };
  const enriched = { event, emittedAt: new Date().toISOString(), data: payload };
  const delivery = await webhookDeliveries.create({ subscriptionId: sub.id, event, payload: enriched });
  const result = await deliverOne(sub, delivery);
  return { ok: result.ok, status: result.status, deliveryId: delivery.id };
}

module.exports = {
  WEBHOOK_EVENTS,
  listSubscriptions,
  createSubscription,
  updateSubscription,
  removeSubscription,
  listDeliveries,
  emit,
  emitAsync,
  emitToSubscription,
  signPayload,
};

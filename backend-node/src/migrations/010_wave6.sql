-- =========================================================================
-- 010_wave6.sql
-- Wave 6 schema:
--   * weigh_ins: per-application weigh-in records with optional photo proof
--   * webhook_subscriptions: external endpoints to notify on platform events
--   * webhook_deliveries: per-delivery audit log (status, attempt, response)
--   * matches.scoreboard: cage-side scoreboard live state (denormalized JSON)
-- All changes are additive, idempotent, and safe on prod.
-- =========================================================================

-- 1) Weigh-in records (signed proof for the application).
CREATE TABLE IF NOT EXISTS weigh_ins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  weight_kg       NUMERIC(5,2) NOT NULL,
  photo_url       TEXT,
  notes           TEXT,
  weighed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  weighed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_weigh_ins_application
  ON weigh_ins (application_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_weigh_ins_weighed_at
  ON weigh_ins (weighed_at DESC)
  WHERE deleted_at IS NULL;

-- 2) Webhook subscriptions (admin-managed outbound endpoints).
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL,
  events        TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_active
  ON webhook_subscriptions (is_active)
  WHERE deleted_at IS NULL;

DO $$ BEGIN
  CREATE TRIGGER trg_webhook_subscriptions_updated
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Webhook deliveries (audit log per attempt).
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  response_code   INTEGER,
  response_body   TEXT,
  error_message   TEXT,
  next_retry_at   TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription
  ON webhook_deliveries (subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON webhook_deliveries (status, next_retry_at)
  WHERE status IN ('pending', 'retry');

DO $$ BEGIN
  ALTER TABLE webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_status_chk
    CHECK (status IN ('pending', 'retry', 'success', 'failed', 'dropped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Cage-side scoreboard live state per match (denormalized JSON for fast
--    tablet renders; canonical result still flows through matches.result_*).
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS scoreboard JSONB NOT NULL DEFAULT '{}'::jsonb;

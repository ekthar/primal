-- =========================================================================
-- 008_documents_verify.sql
-- Adds per-document verification metadata and capture-source telemetry.
--   - verified_at / verified_by / verify_reason  → admin verify/reject UI
--   - id_number_last4                             → last 4 of govt ID only
--                                                   (DPDP Act 2023 compliance)
--   - captured_via                                → 'upload' | 'scan'
-- All columns are additive and nullable. Backfill not required.
-- =========================================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verify_reason    TEXT,
  ADD COLUMN IF NOT EXISTS id_number_last4  VARCHAR(4),
  ADD COLUMN IF NOT EXISTS captured_via     TEXT;

-- Sanity guards
DO $$ BEGIN
  ALTER TABLE documents
    ADD CONSTRAINT documents_id_last4_chk CHECK (id_number_last4 IS NULL OR id_number_last4 ~ '^[0-9A-Za-z]{4}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE documents
    ADD CONSTRAINT documents_captured_via_chk CHECK (captured_via IS NULL OR captured_via IN ('upload','scan','admin_rescan'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_documents_verified
  ON documents (verified_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_expires
  ON documents (expires_on)
  WHERE deleted_at IS NULL AND expires_on IS NOT NULL;

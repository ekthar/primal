-- =========================================================================
-- 015: Identity verification — duplicate registration prevention
--
-- Stores a one-way hash of (lowercase name) + last 4 digits of the
-- government-issued photo ID (Aadhaar / PAN / passport / voter ID).
-- The unique constraint prevents the same person from registering
-- multiple times under different accounts while complying with the
-- DPDP Act 2023 (no full Aadhaar number is stored).
--
-- `name_hash` = SHA-256( LOWER(TRIM(first_name || last_name)) )
-- `id_last4`  = last 4 characters of the government ID
-- =========================================================================

CREATE TABLE IF NOT EXISTS identity_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_hash     TEXT NOT NULL,
  id_last4      VARCHAR(4) NOT NULL,
  date_of_birth DATE,
  profile_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent the same person registering twice
  CONSTRAINT uq_identity UNIQUE (name_hash, id_last4)
);

-- Speed up lookups by name_hash during submission cross-check
CREATE INDEX IF NOT EXISTS idx_identity_verifications_name_hash
  ON identity_verifications (name_hash);

-- Also index by id_last4 for admin review queries
CREATE INDEX IF NOT EXISTS idx_identity_verifications_id_last4
  ON identity_verifications (id_last4);

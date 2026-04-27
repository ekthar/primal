-- =========================================================================
-- 009_wave5.sql
-- Wave 5 schema:
--   * state_coordinator role on user_role enum (per-state operations lead)
--   * users.state_code           → coordinator scope (full state name OR ISO)
--   * matches.result_method      → KO/TKO/SUB/DEC/DQ/NC
--   * matches.result_round       → integer round (1..20)
--   * matches.result_time        → "MM:SS" (validated string, length ≤ 5)
-- All changes are additive, idempotent, and safe on prod.
-- =========================================================================

-- 1) Extend user_role enum.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'state_coordinator';

-- 2) Coordinator scope on users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS state_code TEXT;

CREATE INDEX IF NOT EXISTS idx_users_state_code
  ON users (state_code)
  WHERE state_code IS NOT NULL AND deleted_at IS NULL;

-- 3) Match result detail.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS result_method TEXT,
  ADD COLUMN IF NOT EXISTS result_round  INTEGER,
  ADD COLUMN IF NOT EXISTS result_time   VARCHAR(5);

DO $$ BEGIN
  ALTER TABLE matches
    ADD CONSTRAINT matches_result_method_chk
    CHECK (result_method IS NULL OR result_method IN ('KO','TKO','SUB','DEC','DQ','NC'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE matches
    ADD CONSTRAINT matches_result_round_chk
    CHECK (result_round IS NULL OR (result_round >= 1 AND result_round <= 20));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE matches
    ADD CONSTRAINT matches_result_time_chk
    CHECK (result_time IS NULL OR result_time ~ '^[0-9]{1,2}:[0-9]{2}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

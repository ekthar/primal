-- Admin performance indexes.
-- These are additive and idempotent. They support first-load overview, queue
-- filtering, state scoping, and ILIKE search on admin screens.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_apps_active_updated
  ON applications (updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_apps_active_status_updated
  ON applications (status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_apps_active_reviewer_status_updated
  ON applications (reviewer_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_apps_active_tournament_status_updated
  ON applications (tournament_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_state_metadata_active
  ON profiles ((COALESCE(NULLIF(metadata #>> '{address,state}', ''), NULLIF(metadata #>> '{address,state_code}', ''))))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_first_name_trgm
  ON profiles USING GIN (first_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_last_name_trgm
  ON profiles USING GIN (last_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_name_trgm
  ON users USING GIN (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_trgm
  ON users USING GIN ((email::text) gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clubs_name_trgm
  ON clubs USING GIN (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

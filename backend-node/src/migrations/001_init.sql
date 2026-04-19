-- =========================================================================
-- TournamentOS — Initial schema (PostgreSQL 14+)
-- =========================================================================
-- Design goals:
--   • Permanent record retention via soft delete (deleted_at).
--   • Tamper-evident audit via append-only audit_log with hash chain.
--   • Status transitions recorded in status_events for full history.
--   • Reusable applicant profile across tournaments.
--   • Multilingual-ready via jsonb translation maps where relevant.
--   • Custom form fields via jsonb payloads on applications.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;       -- case-insensitive text for emails

-- ---------- Enums ----------
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('applicant','club','reviewer','admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE application_status AS ENUM
  ('draft','submitted','under_review','needs_correction','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE appeal_status AS ENUM ('submitted','under_review','granted','denied','withdrawn'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_channel AS ENUM ('email','push','whatsapp','sms'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_status AS ENUM ('queued','sent','failed','skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE club_status AS ENUM ('pending','active','suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Users & Auth ----------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT,                                   -- null when using OAuth only
  role            user_role NOT NULL DEFAULT 'applicant',
  name            TEXT NOT NULL,
  phone           TEXT,
  locale          TEXT NOT NULL DEFAULT 'en',
  avatar_url      TEXT,
  google_sub      TEXT UNIQUE,                            -- Google OAuth subject
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users (role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at  ON users (deleted_at);

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_jti     TEXT NOT NULL UNIQUE,
  user_agent      TEXT,
  ip              INET,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- ---------- Clubs ----------
CREATE TABLE IF NOT EXISTS clubs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  city            TEXT,
  country         TEXT,
  status          club_status NOT NULL DEFAULT 'pending',
  primary_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,     -- free-form (social, bio, translations)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_clubs_status ON clubs (status) WHERE deleted_at IS NULL;

-- Club memberships (a user can coordinate multiple clubs; participants limited separately).
CREATE TABLE IF NOT EXISTS club_members (
  club_id    UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'manager',   -- 'manager' | 'coach' etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (club_id, user_id)
);

-- ---------- Applicant profile (reusable across tournaments) ----------
-- A participant belongs to ONE club only (business rule). NULL club_id = individual.
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  club_id         UUID REFERENCES clubs(id) ON DELETE SET NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  date_of_birth   DATE,
  gender          TEXT,
  nationality     TEXT,
  discipline      TEXT,
  weight_kg       NUMERIC(5,2),
  weight_class    TEXT,
  record_wins     INTEGER NOT NULL DEFAULT 0,
  record_losses   INTEGER NOT NULL DEFAULT 0,
  record_draws    INTEGER NOT NULL DEFAULT 0,
  bio             TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_profiles_club ON profiles (club_id) WHERE deleted_at IS NULL;

-- ---------- Tournaments ----------
CREATE TABLE IF NOT EXISTS tournaments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  season          TEXT,
  starts_on       DATE,
  ends_on         DATE,
  registration_open_at  TIMESTAMPTZ,
  registration_close_at TIMESTAMPTZ,
  form_schema     JSONB NOT NULL DEFAULT '[]'::jsonb,    -- custom form fields spec
  translations    JSONB NOT NULL DEFAULT '{}'::jsonb,    -- {en:{},ja:{}}
  is_public       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ---------- Applications (a profile applying to a tournament) ----------
CREATE TABLE IF NOT EXISTS applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tournament_id     UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  club_id           UUID REFERENCES clubs(id) ON DELETE SET NULL,  -- snapshotted at apply time
  submitted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  status            application_status NOT NULL DEFAULT 'draft',
  form_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewer_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_assigned_at TIMESTAMPTZ,
  review_due_at     TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ,
  review_started_at TIMESTAMPTZ,
  decided_at        TIMESTAMPTZ,
  correction_due_at TIMESTAMPTZ,
  correction_reason TEXT,
  correction_fields JSONB,                            -- array of field keys needing fix
  rejection_reason  TEXT,
  reopen_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (profile_id, tournament_id)
);
CREATE INDEX IF NOT EXISTS idx_apps_status          ON applications (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_apps_reviewer        ON applications (reviewer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_apps_tournament      ON applications (tournament_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_apps_review_due      ON applications (review_due_at) WHERE status IN ('submitted','under_review') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_apps_correction_due  ON applications (correction_due_at) WHERE status = 'needs_correction' AND deleted_at IS NULL;

-- ---------- Status transition event log ----------
-- Append-only.
CREATE TABLE IF NOT EXISTS status_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status     application_status,
  to_status       application_status NOT NULL,
  reason          TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role      user_role,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_status_events_app ON status_events (application_id, created_at DESC);

-- ---------- Documents (medicals, IDs, photos) ----------
CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID REFERENCES applications(id) ON DELETE CASCADE,
  profile_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                     -- 'medical','photo_id','club_letter','consent'
  label           TEXT,
  mime_type       TEXT,
  size_bytes      BIGINT,
  storage_key     TEXT NOT NULL,                     -- path on disk or S3 key
  checksum_sha256 TEXT,
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_on      DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  CHECK (application_id IS NOT NULL OR profile_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_documents_app     ON documents (application_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_profile ON documents (profile_id) WHERE deleted_at IS NULL;

-- ---------- Appeals ----------
CREATE TABLE IF NOT EXISTS appeals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id     UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  filed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  reason             TEXT NOT NULL,
  status             appeal_status NOT NULL DEFAULT 'submitted',
  panel_decision     TEXT,
  decided_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_appeals_app    ON appeals (application_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals (status) WHERE deleted_at IS NULL;

-- ---------- Notifications ----------
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
  channel         notification_channel NOT NULL,
  template        TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          notification_status NOT NULL DEFAULT 'queued',
  provider_ref    TEXT,
  error           TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user   ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications (status);

-- ---------- Audit log (tamper-evident, append-only) ----------
-- hash = sha256(prev_hash || payload_json)
CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGSERIAL PRIMARY KEY,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id   UUID,
  actor_role      user_role,
  action          TEXT NOT NULL,                 -- 'application.approve', 'club.create', ...
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_ip      INET,
  prev_hash       TEXT,
  hash            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log (actor_user_id, occurred_at DESC);
-- Prevent updates/deletes at the DB level.
CREATE OR REPLACE FUNCTION audit_immutable_guard() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are append-only (%, %)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_no_update ON audit_log;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_immutable_guard();

-- ---------- updated_at triggers ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','clubs','profiles','tournaments','applications','appeals'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %s;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);
  END LOOP;
END $$;

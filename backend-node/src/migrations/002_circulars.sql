-- =========================================================================
-- Circulars / Public Updates
-- =========================================================================
-- Purpose:
--  - Allow admins to publish "circulars" (announcements) that appear on the
--    public website: registration open/close, edit windows, rule updates, etc.
--  - Time-window support (show_from/show_until) for automatic expiry.
--  - Soft-delete support via deleted_at (consistent with rest of schema).

CREATE TABLE IF NOT EXISTS circulars (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  subtitle      TEXT,
  kind          TEXT NOT NULL DEFAULT 'notice',        -- 'registration' | 'window' | 'rules' | 'notice'
  body          TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  cta_label     TEXT,
  cta_url       TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ,
  show_from     TIMESTAMPTZ,
  show_until    TIMESTAMPTZ,
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_circulars_published ON circulars (is_published, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_circulars_window ON circulars (show_from, show_until) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_circulars_pinned ON circulars (pinned, published_at DESC) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_circulars_updated ON circulars;
CREATE TRIGGER trg_circulars_updated BEFORE UPDATE ON circulars FOR EACH ROW EXECUTE FUNCTION set_updated_at();


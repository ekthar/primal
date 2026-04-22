CREATE TABLE IF NOT EXISTS brackets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  category_id     TEXT NOT NULL,
  category_label  TEXT NOT NULL,
  seeding         TEXT NOT NULL DEFAULT 'fair_draw',
  status          TEXT NOT NULL DEFAULT 'draft',
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (tournament_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_brackets_tournament ON brackets (tournament_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_brackets_updated ON brackets;
CREATE TRIGGER trg_brackets_updated
BEFORE UPDATE ON brackets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

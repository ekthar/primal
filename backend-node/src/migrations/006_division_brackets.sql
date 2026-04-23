DO $$ BEGIN
  CREATE TYPE division_entry_status AS ENUM ('approved', 'rejected', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE division_format AS ENUM ('single_elim');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bracket_match_status AS ENUM ('pending', 'ready', 'walkover', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS disciplines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  discipline_id UUID NOT NULL REFERENCES disciplines(id) ON DELETE RESTRICT,
  sex TEXT NOT NULL,
  age_band TEXT NOT NULL,
  weight_class TEXT NOT NULL,
  experience_level TEXT NOT NULL DEFAULT 'open',
  format division_format NOT NULL DEFAULT 'single_elim',
  label TEXT NOT NULL,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (tournament_id, discipline_id, sex, age_band, weight_class, experience_level)
);
CREATE INDEX IF NOT EXISTS idx_divisions_tournament ON divisions (tournament_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS division_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_name TEXT NOT NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  club_name TEXT,
  seed INTEGER,
  derived_seed_score INTEGER NOT NULL DEFAULT 0,
  status division_entry_status NOT NULL DEFAULT 'approved',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (division_id, application_id)
);
CREATE INDEX IF NOT EXISTS idx_division_entries_division ON division_entries (division_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_division_entries_profile ON division_entries (profile_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  entry1_id UUID REFERENCES division_entries(id) ON DELETE SET NULL,
  entry2_id UUID REFERENCES division_entries(id) ON DELETE SET NULL,
  winner_entry_id UUID REFERENCES division_entries(id) ON DELETE SET NULL,
  next_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  next_match_slot INTEGER,
  status bracket_match_status NOT NULL DEFAULT 'pending',
  conflict JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (division_id, round_number, match_number),
  CHECK (next_match_slot IS NULL OR next_match_slot IN (1, 2))
);
CREATE INDEX IF NOT EXISTS idx_matches_division ON matches (division_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_matches_next_match ON matches (next_match_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_disciplines_updated ON disciplines;
CREATE TRIGGER trg_disciplines_updated BEFORE UPDATE ON disciplines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_divisions_updated ON divisions;
CREATE TRIGGER trg_divisions_updated BEFORE UPDATE ON divisions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_division_entries_updated ON division_entries;
CREATE TRIGGER trg_division_entries_updated BEFORE UPDATE ON division_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_matches_updated ON matches;
CREATE TRIGGER trg_matches_updated BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

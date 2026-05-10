-- =========================================================================
-- 014: doctor / referee notes per match + weight-class tolerance per tournament
-- =========================================================================

-- Per-match notes captured at the cage scoreboard. Both nullable; either
-- the doctor (post-fight medical / cuts / stoppage rationale) or the
-- referee (in-bout warnings, point deductions, contested calls) can fill
-- their respective field. UI presents them as separate textareas; backend
-- stores them on the matches row so they ride along with result audits.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS doctor_notes  TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS referee_notes TEXT;

-- Per-tournament weight tolerance (kg). When a recorded weigh-in is at most
-- weight_class_max + tolerance_kg, the bracket sync keeps the fighter in
-- their original division. Above tolerance, they're moved as before.
-- 0 = strict (current behaviour).
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS weight_tolerance_kg NUMERIC(4, 2) NOT NULL DEFAULT 0;

ALTER TABLE tournaments
  ADD CONSTRAINT chk_weight_tolerance_kg_nonneg
  CHECK (weight_tolerance_kg >= 0);

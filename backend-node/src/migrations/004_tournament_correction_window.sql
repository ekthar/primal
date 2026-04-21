-- Per-tournament correction window configuration for admin control
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS correction_window_hours INTEGER;

-- Keep values sane when set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_tournaments_correction_window_hours_range'
  ) THEN
    ALTER TABLE tournaments
      ADD CONSTRAINT chk_tournaments_correction_window_hours_range
      CHECK (
        correction_window_hours IS NULL
        OR (correction_window_hours >= 1 AND correction_window_hours <= 720)
      );
  END IF;
END $$;

-- Add the terminal status used when a new public season closes unfinished
-- applications from older tournaments.
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'season_closed';

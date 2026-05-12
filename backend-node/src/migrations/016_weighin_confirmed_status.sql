-- =========================================================================
-- 016: Add 'confirmed' status to the application state machine
--
-- After a successful weigh-in, an approved application transitions to
-- 'confirmed'. This gives admins a clear visual indicator and allows
-- gating bracket publication / match scheduling on weigh-in completion.
-- =========================================================================

ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'confirmed';

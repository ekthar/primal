ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{"email":true,"push":true,"whatsapp":true,"sms":true}'::jsonb;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_apps_status_deleted_at ON applications (status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_apps_reviewer_status_deleted_at ON applications (reviewer_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_apps_tournament_status_deleted_at ON applications (tournament_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_appeals_application_status ON appeals (application_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_occurred_at ON audit_log (entity_type, entity_id, occurred_at DESC);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS original_filename TEXT;

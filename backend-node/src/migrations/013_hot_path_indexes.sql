-- Hot-path indexes for application workspaces and participant listings.

CREATE INDEX IF NOT EXISTS idx_apps_active_profile_updated
  ON applications (profile_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_apps_active_club_updated
  ON applications (club_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_app_created
  ON documents (application_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_status_events_app_created
  ON status_events (application_id, created_at ASC);

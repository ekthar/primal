-- Wave 3 · Primal Academy photo albums.
-- Admins can create albums (optionally tied to a tournament/season), upload
-- photos (Vercel Blob or local disk depending on the storage provider), and
-- expose the album on the public site. Soft delete only.

CREATE TABLE IF NOT EXISTS albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  cover_photo_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_albums_public ON albums (is_public) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_albums_tournament ON albums (tournament_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS album_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  width INTEGER,
  height INTEGER,
  bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_album_photos_album ON album_photos (album_id, order_index) WHERE deleted_at IS NULL;

ALTER TABLE albums
  DROP CONSTRAINT IF EXISTS albums_cover_photo_id_fkey,
  ADD CONSTRAINT albums_cover_photo_id_fkey
    FOREIGN KEY (cover_photo_id) REFERENCES album_photos(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_albums_updated ON albums;
CREATE TRIGGER trg_albums_updated BEFORE UPDATE ON albums FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_album_photos_updated ON album_photos;
CREATE TRIGGER trg_album_photos_updated BEFORE UPDATE ON album_photos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

// Photo-album orchestration. Admins create albums + upload photos. Soft
// delete only. Album `is_public=true` rows are served by the public routes
// so the landing page / athlete site can embed them without auth.
const { query, transaction } = require('../db');
const { put, del } = require('@vercel/blob');
const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { logger } = require('../logger');
const { write: auditWrite } = require('../audit');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function mapAlbumRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    tournamentId: row.tournament_id,
    tournamentName: row.tournament_name || null,
    isPublic: !!row.is_public,
    coverPhotoId: row.cover_photo_id,
    coverUrl: row.cover_url || null,
    photoCount: row.photo_count !== undefined ? Number(row.photo_count) : undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPhotoRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    albumId: row.album_id,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    caption: row.caption,
    orderIndex: row.order_index,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

async function listAlbums({ publicOnly = false, tournamentId = null, tournamentSlug = null } = {}) {
  const where = ['a.deleted_at IS NULL'];
  const args = [];
  if (publicOnly) where.push('a.is_public = true');
  if (tournamentId) {
    args.push(tournamentId);
    where.push(`a.tournament_id = $${args.length}`);
  } else if (tournamentSlug) {
    args.push(tournamentSlug);
    where.push(`t.slug = $${args.length}`);
  }

  const { rows } = await query(`
    SELECT a.*, t.name AS tournament_name,
           cover.url AS cover_url,
           (SELECT COUNT(*) FROM album_photos p WHERE p.album_id = a.id AND p.deleted_at IS NULL) AS photo_count
    FROM albums a
    LEFT JOIN tournaments t ON t.id = a.tournament_id
    LEFT JOIN album_photos cover ON cover.id = a.cover_photo_id AND cover.deleted_at IS NULL
    WHERE ${where.join(' AND ')}
    ORDER BY a.created_at DESC
  `, args);
  return rows.map(mapAlbumRow);
}

async function listRecentPublicPhotos({ limit = 12 } = {}) {
  const { rows } = await query(`
    SELECT p.id, p.album_id, p.url, p.thumbnail_url, p.caption,
           a.name AS album_name, a.slug AS album_slug,
           t.name AS tournament_name, t.slug AS tournament_slug
    FROM album_photos p
    JOIN albums a ON a.id = p.album_id
    LEFT JOIN tournaments t ON t.id = a.tournament_id
    WHERE p.deleted_at IS NULL
      AND a.deleted_at IS NULL
      AND a.is_public = true
    ORDER BY p.created_at DESC
    LIMIT $1
  `, [limit]);
  return rows.map((row) => ({
    id: row.id,
    albumId: row.album_id,
    albumName: row.album_name,
    albumSlug: row.album_slug,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    caption: row.caption,
    tournamentName: row.tournament_name,
    tournamentSlug: row.tournament_slug,
  }));
}

async function getAlbum(id, { publicOnly = false } = {}) {
  const where = ['a.id = $1', 'a.deleted_at IS NULL'];
  if (publicOnly) where.push('a.is_public = true');

  const { rows } = await query(`
    SELECT a.*, t.name AS tournament_name,
           cover.url AS cover_url
    FROM albums a
    LEFT JOIN tournaments t ON t.id = a.tournament_id
    LEFT JOIN album_photos cover ON cover.id = a.cover_photo_id AND cover.deleted_at IS NULL
    WHERE ${where.join(' AND ')}
    LIMIT 1
  `, [id]);
  const album = mapAlbumRow(rows[0]);
  if (!album) return null;

  const photoRes = await query(`
    SELECT * FROM album_photos
    WHERE album_id = $1 AND deleted_at IS NULL
    ORDER BY order_index ASC, created_at ASC
  `, [id]);
  album.photos = photoRes.rows.map(mapPhotoRow);
  return album;
}

async function createAlbum(actor, input) {
  const name = String(input?.name || '').trim();
  if (!name) throw Object.assign(new Error('Album name is required'), { status: 422 });

  const slug = slugify(input?.slug || name);
  const { rows } = await query(`
    INSERT INTO albums (name, slug, description, tournament_id, is_public, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    name,
    slug || null,
    input?.description || null,
    input?.tournamentId || null,
    input?.isPublic === false ? false : true,
    actor?.id || null,
  ]);

  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'album.create',
    entityType: 'album',
    entityId: rows[0].id,
    payload: { name, tournamentId: input?.tournamentId || null },
  });
  return mapAlbumRow(rows[0]);
}

async function updateAlbum(actor, id, input) {
  const fields = [];
  const args = [];
  const push = (col, val) => {
    args.push(val);
    fields.push(`${col} = $${args.length}`);
  };
  if (input.name !== undefined) push('name', String(input.name).trim());
  if (input.slug !== undefined) push('slug', slugify(input.slug));
  if (input.description !== undefined) push('description', input.description || null);
  if (input.tournamentId !== undefined) push('tournament_id', input.tournamentId || null);
  if (input.isPublic !== undefined) push('is_public', !!input.isPublic);
  if (input.coverPhotoId !== undefined) push('cover_photo_id', input.coverPhotoId || null);
  if (!fields.length) {
    return getAlbum(id);
  }
  args.push(id);
  const { rows } = await query(
    `UPDATE albums SET ${fields.join(', ')} WHERE id = $${args.length} AND deleted_at IS NULL RETURNING *`,
    args,
  );
  if (!rows.length) throw Object.assign(new Error('Album not found'), { status: 404 });
  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'album.update',
    entityType: 'album',
    entityId: id,
    payload: input,
  });
  return getAlbum(id);
}

async function removeAlbum(actor, id) {
  await query(`UPDATE albums SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id]);
  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'album.delete',
    entityType: 'album',
    entityId: id,
    payload: {},
  });
  return { ok: true };
}

function sanitizeFilename(name) {
  return String(name || 'photo').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'photo';
}

async function storePhotoFile(albumId, file) {
  const filename = sanitizeFilename(file.originalname);
  const pathname = `albums/${albumId}/${Date.now()}-${filename}`;

  if (config.uploadStorageProvider === 'vercel-blob') {
    if (!config.blob.readWriteToken) {
      throw Object.assign(new Error('BLOB_READ_WRITE_TOKEN is required for album uploads'), { status: 503 });
    }
    const blob = await put(pathname, file.buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.mimetype,
      multipart: file.size >= 5 * 1024 * 1024,
      token: config.blob.readWriteToken,
    });
    return { url: blob.url, thumbnailUrl: blob.url, bytes: file.size };
  }

  const dir = path.resolve(config.uploadDir, 'albums', albumId);
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, `${Date.now()}-${filename}`);
  await fs.promises.writeFile(abs, file.buffer);
  const publicBase = String(config.appBaseUrl || '').replace(/\/+$/, '');
  const key = path.relative(config.uploadDir, abs).replace(/\\/g, '/');
  const url = publicBase ? `${publicBase}/uploads/${key}` : `/uploads/${key}`;
  return { url, thumbnailUrl: url, bytes: file.size };
}

async function addPhoto(actor, albumId, file, input = {}) {
  const album = await getAlbum(albumId);
  if (!album) throw Object.assign(new Error('Album not found'), { status: 404 });

  const { url, thumbnailUrl, bytes } = await storePhotoFile(albumId, file);

  const created = await transaction(async (client) => {
    const { rows: order } = await client.query(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM album_photos WHERE album_id = $1`,
      [albumId],
    );
    const nextOrder = order[0]?.next_order ?? 0;
    const { rows } = await client.query(
      `INSERT INTO album_photos (album_id, url, thumbnail_url, caption, order_index, uploaded_by, bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [albumId, url, thumbnailUrl, input?.caption || null, input?.orderIndex ?? nextOrder, actor?.id || null, bytes || null],
    );
    if (!album.coverPhotoId) {
      await client.query(`UPDATE albums SET cover_photo_id = $1 WHERE id = $2`, [rows[0].id, albumId]);
    }
    return rows[0];
  });

  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'album.photo_add',
    entityType: 'album',
    entityId: albumId,
    payload: { photoId: created.id, bytes: bytes || 0 },
  });
  return mapPhotoRow(created);
}

async function removePhoto(actor, albumId, photoId) {
  const { rows } = await query(`
    SELECT * FROM album_photos
    WHERE id = $1 AND album_id = $2 AND deleted_at IS NULL
    LIMIT 1
  `, [photoId, albumId]);
  const photo = rows[0];
  if (!photo) return { ok: true };

  await query(`UPDATE album_photos SET deleted_at = NOW() WHERE id = $1`, [photoId]);
  await query(
    `UPDATE albums SET cover_photo_id = NULL
     WHERE id = $1 AND cover_photo_id = $2`,
    [albumId, photoId],
  );

  // Best-effort Blob cleanup — never fail the request on this.
  if (config.uploadStorageProvider === 'vercel-blob' && photo.url && photo.url.startsWith('https://')) {
    try {
      await del(photo.url, { token: config.blob.readWriteToken });
    } catch (err) {
      logger.warn({ err, photoId }, 'Failed to delete blob during album photo removal');
    }
  }

  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'album.photo_remove',
    entityType: 'album',
    entityId: albumId,
    payload: { photoId },
  });
  return { ok: true };
}

module.exports = {
  listAlbums,
  listRecentPublicPhotos,
  getAlbum,
  createAlbum,
  updateAlbum,
  removeAlbum,
  addPhoto,
  removePhoto,
};

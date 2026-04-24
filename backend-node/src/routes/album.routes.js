const { Router } = require('express');
const multer = require('multer');
const { ah, requireAuth, requireRole } = require('../middleware');
const albums = require('../services/album.service');
const { config } = require('../config');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
});

// Admin listing — includes non-public albums
router.get('/', requireAuth, requireRole('admin'), ah(async (_req, res) => {
  const items = await albums.listAlbums({ publicOnly: false });
  res.json({ items });
}));

router.post('/', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const album = await albums.createAlbum(req.user, req.body || {});
  res.status(201).json({ album });
}));

router.get('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const album = await albums.getAlbum(req.params.id, { publicOnly: false });
  if (!album) return res.status(404).json({ error: 'not_found' });
  res.json({ album });
}));

router.patch('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  const album = await albums.updateAlbum(req.user, req.params.id, req.body || {});
  res.json({ album });
}));

router.delete('/:id', requireAuth, requireRole('admin'), ah(async (req, res) => {
  res.json(await albums.removeAlbum(req.user, req.params.id));
}));

router.post('/:id/photos', requireAuth, requireRole('admin'), upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file_required' });
  if (!/^image\//i.test(req.file.mimetype || '')) {
    return res.status(415).json({ error: 'unsupported_media_type' });
  }
  const photo = await albums.addPhoto(req.user, req.params.id, req.file, {
    caption: req.body?.caption,
    orderIndex: req.body?.orderIndex !== undefined ? Number(req.body.orderIndex) : undefined,
  });
  res.status(201).json({ photo });
}));

router.delete('/:id/photos/:photoId', requireAuth, requireRole('admin'), ah(async (req, res) => {
  res.json(await albums.removePhoto(req.user, req.params.id, req.params.photoId));
}));

module.exports = router;

const { Router } = require('express');
const Joi = require('joi');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { put } = require('@vercel/blob');
const { ah, requireAuth, requireRole, validate } = require('../middleware');
const { config } = require('../config');
const weighinService = require('../services/weighin.service');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (config.maxUploadMb || 5) * 1024 * 1024 },
});

function sanitize(name) {
  return String(name || 'weighin').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'weighin';
}

async function storeWeighinPhoto(applicationId, file) {
  const filename = sanitize(file.originalname || 'proof.jpg');
  const pathname = `weighins/${applicationId}/${Date.now()}-${filename}`;
  if (config.uploadStorageProvider === 'vercel-blob') {
    if (!config.blob?.readWriteToken) {
      throw Object.assign(new Error('BLOB_READ_WRITE_TOKEN required for weigh-in photo upload'), { status: 503 });
    }
    const blob = await put(pathname, file.buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.mimetype || 'image/jpeg',
      token: config.blob.readWriteToken,
    });
    return blob.url;
  }
  const dir = path.resolve(config.uploadDir, 'weighins', applicationId);
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, `${Date.now()}-${filename}`);
  await fs.promises.writeFile(abs, file.buffer);
  const publicBase = String(config.appBaseUrl || '').replace(/\/+$/, '');
  const key = path.relative(config.uploadDir, abs).replace(/\\/g, '/');
  return publicBase ? `${publicBase}/uploads/${key}` : `/uploads/${key}`;
}

router.use(requireAuth, requireRole('admin', 'reviewer', 'state_coordinator'));

router.get('/by-application/:applicationId', ah(async (req, res) => {
  const records = await weighinService.listForApplication(req.params.applicationId);
  res.json({ records });
}));

router.get('/by-tournament/:tournamentId', ah(async (req, res) => {
  const records = await weighinService.listForTournament(req.params.tournamentId, { limit: 500 });
  res.json({ records });
}));

const recordBodySchema = Joi.object({
  applicationId: Joi.string().uuid().required(),
  weightKg: Joi.number().min(15).max(250).required(),
  notes: Joi.string().max(1000).allow('', null),
  photoUrl: Joi.string().uri().allow('', null),
});

router.post('/', upload.single('photo'), ah(async (req, res) => {
  // Accept multipart (with photo file) OR JSON (with photoUrl). Coerce numeric weight.
  const body = { ...req.body };
  if (typeof body.weightKg === 'string') body.weightKg = Number(body.weightKg);
  const { value, error } = recordBodySchema.validate(body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(422).json({
      error: { code: 'UNPROCESSABLE', message: 'Validation failed', details: error.details.map((d) => ({ path: d.path.join('.'), message: d.message })) },
    });
  }
  let photoUrl = value.photoUrl || null;
  if (req.file) {
    photoUrl = await storeWeighinPhoto(value.applicationId, req.file);
  }
  const record = await weighinService.recordWeighIn({
    applicationId: value.applicationId,
    weightKg: value.weightKg,
    photoUrl,
    notes: value.notes || null,
    actor: req.user,
  });
  res.status(201).json({ record });
}));

module.exports = router;

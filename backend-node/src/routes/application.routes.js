const { Router } = require('express');
const { ah, validate, requireAuth } = require('../middleware');
const { schemas } = require('../validators');
const apps = require('../services/application.service');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { config } = require('../config');

const router = Router();
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.resolve(config.uploadDir, 'applications', req.params.id || 'tmp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });

router.get('/', requireAuth, validate(schemas.queue.list, 'query'), ah(async (req, res) => {
  res.json({ items: await apps.listForMe(req.user, req.query) });
}));

router.post('/', requireAuth, validate(schemas.application.create), ah(async (req, res) => {
  res.status(201).json({ application: await apps.create(req.user, req.body, { ip: req.ip }) });
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  res.json({ application: await apps.getById(req.user, req.params.id) });
}));

router.patch('/:id', requireAuth, validate(schemas.application.update), ah(async (req, res) => {
  res.json({ application: await apps.updateDraft(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

router.post('/:id/submit', requireAuth, ah(async (req, res) => {
  res.json({ application: await apps.submit(req.user, req.params.id, { ip: req.ip }) });
}));

router.post('/:id/resubmit', requireAuth, ah(async (req, res) => {
  res.json({ application: await apps.submit(req.user, req.params.id, { ip: req.ip }) });
}));

router.get('/:id/documents', requireAuth, ah(async (req, res) => {
  res.json({ documents: await apps.listDocuments(req.user, req.params.id) });
}));

router.post('/:id/documents', requireAuth, upload.single('file'), ah(async (req, res) => {
  const payload = schemas.document.create.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (payload.error) throw Object.assign(new Error('Validation failed'), {
    status: 422,
    code: 'VALIDATION_FAILED',
    details: { errors: payload.error.details.map((d) => ({ path: d.path.join('.'), message: d.message })) },
  });
  res.status(201).json({ document: await apps.uploadDocument(req.user, req.params.id, { ...payload.value, file: req.file }, { ip: req.ip }) });
}));

module.exports = router;

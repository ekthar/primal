const { Router } = require('express');
const { ah, validate, requireAuth } = require('../middleware');
const { schemas } = require('../validators');
const apps = require('../services/application.service');
const multer = require('multer');
const { config } = require('../config');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
});

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

router.post('/:id/reapply', requireAuth, validate(schemas.application.reapply), ah(async (req, res) => {
  res.status(201).json({ application: await apps.reapply(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

router.post('/:id/cancel-request', requireAuth, validate(schemas.application.cancelRequest), ah(async (req, res) => {
  res.json({ application: await apps.requestCancel(req.user, req.params.id, req.body, { ip: req.ip }) });
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

router.post('/:id/documents/:docId/verify', requireAuth, validate(schemas.document.verify), ah(async (req, res) => {
  res.json({ document: await apps.verifyDocument(req.user, req.params.id, req.params.docId, req.body, { ip: req.ip }) });
}));

module.exports = router;

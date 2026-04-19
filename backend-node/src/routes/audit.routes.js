const { Router } = require('express');
const { ah, requireAuth, requireRole } = require('../middleware');
const audit = require('../audit');
const exporter = require('../services/export.service');

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/entity/:type/:id', ah(async (req, res) => {
  res.json({ entries: await audit.listForEntity(req.params.type, req.params.id) });
}));

router.get('/verify', ah(async (_req, res) => {
  res.json(await audit.verifyChain());
}));

router.get('/export.xlsx', ah(async (req, res) => {
  await exporter.auditToExcel(res, req.user, { since: req.query.since, until: req.query.until });
}));

module.exports = router;

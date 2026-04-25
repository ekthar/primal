const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const queue = require('../services/queue.service');

const router = Router();

router.use(requireAuth, requireRole('admin', 'reviewer', 'state_coordinator'));

router.get('/', validate(schemas.queue.list, 'query'), ah(async (req, res) => {
  res.json(await queue.board(req.query, req.user));
}));

router.get('/sla', ah(async (_req, res) => {
  res.json(await queue.slaSummary({}, null));
}));

router.get('/workload', ah(async (_req, res) => {
  res.json({ reviewers: await queue.reviewerWorkload() });
}));

module.exports = router;

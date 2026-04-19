const { Router } = require('express');
const { ah, validate, requireAuth, requireRole } = require('../middleware');
const { schemas } = require('../validators');
const review = require('../services/review.service');

const router = Router();

// All review endpoints are admin + reviewer only.
router.use(requireAuth, requireRole('admin', 'reviewer'));

router.post('/:id/assign', validate(schemas.review.assign), ah(async (req, res) => {
  res.json({ application: await review.assignReviewer(req.user, req.params.id, req.body.reviewerId, { ip: req.ip }) });
}));

router.post('/:id/start', ah(async (req, res) => {
  res.json({ application: await review.startReview(req.user, req.params.id, { ip: req.ip }) });
}));

router.post('/:id/decision', validate(schemas.review.decision), ah(async (req, res) => {
  res.json({ application: await review.decide(req.user, req.params.id, req.body, { ip: req.ip }) });
}));

router.post('/bulk/decision', validate(schemas.review.bulkDecision), ah(async (req, res) => {
  res.json({ results: await review.bulkDecide(req.user, req.body, { ip: req.ip }) });
}));

router.post('/:id/reopen', requireRole('admin'), ah(async (req, res) => {
  const reason = String(req.body?.reason || 'Reopened');
  res.json({ application: await review.reopen(req.user, req.params.id, { reason }, { ip: req.ip }) });
}));

module.exports = router;

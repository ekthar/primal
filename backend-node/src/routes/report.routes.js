const { Router } = require('express');
const { ah, requireAuth, requireRole } = require('../middleware');
const exporter = require('../services/export.service');
const queue = require('../services/queue.service');
const reportService = require('../services/report.service');

const router = Router();

router.use(requireAuth);

router.get('/summary', requireRole('admin', 'reviewer'), ah(async (_req, res) => {
  const [sla, workload] = await Promise.all([queue.slaSummary(), queue.reviewerWorkload()]);
  res.json({ sla, workload });
}));

router.get('/approved.xlsx', requireRole('admin', 'reviewer'), ah(async (req, res) => {
  await exporter.approvedToExcel(res, { tournamentId: req.query.tournamentId });
}));

router.get('/participants', requireRole('admin'), ah(async (req, res) => {
  const report = await reportService.approvedParticipantReport({ tournamentId: req.query.tournamentId });
  res.json(report);
}));

router.get('/participants.xlsx', requireRole('admin'), ah(async (req, res) => {
  await exporter.approvedParticipantsToExcel(res, { tournamentId: req.query.tournamentId });
}));

router.get('/applications/:id.pdf', ah(async (req, res) => {
  await exporter.applicationToPdf(res, req.params.id, req.user, { ip: req.ip });
}));

module.exports = router;

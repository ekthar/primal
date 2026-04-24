const { Router } = require('express');
const { ah, requireAuth, requireRole } = require('../middleware');
const exporter = require('../services/export.service');
const queue = require('../services/queue.service');
const reportService = require('../services/report.service');

const router = Router();

router.use(requireAuth);

router.get('/summary', requireRole('admin', 'reviewer'), ah(async (_req, res) => {
  const [sla, workload, production] = await Promise.all([
    queue.slaSummary(),
    queue.reviewerWorkload(),
    reportService.productionDiagnostics(),
  ]);
  res.json({ sla, workload, production });
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

router.get('/participants.pdf', requireRole('admin'), ah(async (req, res) => {
  await exporter.approvedParticipantsToPdf(res, req.user, {
    tournamentId: req.query.tournamentId,
  }, { ip: req.ip });
}));

router.get('/participants.zip', requireRole('admin'), ah(async (req, res) => {
  await exporter.bulkApprovedParticipantsToZip(
    res,
    req.user,
    { tournamentId: req.query.tournamentId },
    { ip: req.ip },
  );
}));

router.get('/analytics', requireRole('admin'), ah(async (req, res) => {
  const report = await reportService.groupedApplicationReport({
    tournamentId: req.query.tournamentId,
    discipline: req.query.discipline,
  });
  res.json(report);
}));

router.get('/analytics.xlsx', requireRole('admin'), ah(async (req, res) => {
  await exporter.groupedAnalyticsToExcel(res, {
    tournamentId: req.query.tournamentId,
    discipline: req.query.discipline,
  });
}));

router.get('/analytics.pdf', requireRole('admin'), ah(async (req, res) => {
  await exporter.groupedAnalyticsToPdf(res, req.user, {
    tournamentId: req.query.tournamentId,
    discipline: req.query.discipline,
  }, { ip: req.ip });
}));

router.get('/seasons/:id', requireRole('admin'), ah(async (req, res) => {
  const report = await reportService.seasonalTournamentReport({ tournamentId: req.params.id });
  res.json(report);
}));

router.get('/seasons/:id.pdf', requireRole('admin'), ah(async (req, res) => {
  await exporter.seasonalReportToPdf(res, req.user, req.params.id, { ip: req.ip });
}));

router.get('/applications/:id.pdf', ah(async (req, res) => {
  await exporter.applicationToPdf(res, req.params.id, req.user, { ip: req.ip });
}));

router.get('/applications/:id.paper', ah(async (req, res) => {
  res.json({ paper: await exporter.applicationToPaper(req.params.id, req.user) });
}));

module.exports = router;

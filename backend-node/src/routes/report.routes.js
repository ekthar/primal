const { Router } = require('express');
const { ah, requireAuth, requireRole } = require('../middleware');
const exporter = require('../services/export.service');
const queue = require('../services/queue.service');
const reportService = require('../services/report.service');

const router = Router();

router.use(requireAuth);

router.get('/summary', requireRole('admin', 'reviewer', 'state_coordinator'), ah(async (req, res) => {
  const includeDiagnostics = req.query.includeDiagnostics === 'true';
  const [sla, workload, counts, production] = await Promise.all([
    queue.slaSummary({}, req.user),
    queue.reviewerWorkload(),
    queue.countsSummary({}, req.user),
    includeDiagnostics ? reportService.productionDiagnostics() : Promise.resolve(null),
  ]);
  res.json({
    sla,
    workload,
    counts,
    ...(includeDiagnostics ? { production } : {}),
  });
}));

router.get('/approved.xlsx', requireRole('admin', 'reviewer', 'state_coordinator'), ah(async (req, res) => {
  await exporter.approvedToExcel(res, { tournamentId: req.query.tournamentId, stateCode: req.user.role === 'state_coordinator' ? req.user.stateCode : req.query.stateCode });
}));

router.get('/participants', requireRole('admin', 'state_coordinator'), ah(async (req, res) => {
  const report = await reportService.approvedParticipantReport({ tournamentId: req.query.tournamentId, stateCode: req.user.role === 'state_coordinator' ? req.user.stateCode : req.query.stateCode });
  res.json(report);
}));

router.get('/participants.xlsx', requireRole('admin', 'state_coordinator'), ah(async (req, res) => {
  await exporter.approvedParticipantsToExcel(res, { tournamentId: req.query.tournamentId, stateCode: req.user.role === 'state_coordinator' ? req.user.stateCode : req.query.stateCode });
}));

router.get('/participants.pdf', requireRole('admin', 'state_coordinator'), ah(async (req, res) => {
  await exporter.approvedParticipantsToPdf(res, req.user, {
    tournamentId: req.query.tournamentId,
    stateCode: req.user.role === 'state_coordinator' ? req.user.stateCode : req.query.stateCode,
  }, { ip: req.ip });
}));

router.get('/participants.zip', requireRole('admin', 'state_coordinator'), ah(async (req, res) => {
  await exporter.bulkApprovedParticipantsToZip(
    res,
    req.user,
    { tournamentId: req.query.tournamentId, stateCode: req.user.role === 'state_coordinator' ? req.user.stateCode : req.query.stateCode },
    { ip: req.ip },
  );
}));

router.get('/analytics', requireRole('admin', 'state_coordinator'), ah(async (req, res) => {
  const report = await reportService.groupedApplicationReport({
    tournamentId: req.query.tournamentId,
    discipline: req.query.discipline,
    stateCode: req.user.role === 'state_coordinator' ? req.user.stateCode : req.query.stateCode,
  });
  res.json(report);
}));

router.get('/analytics.xlsx', requireRole('admin', 'state_coordinator'), ah(async (req, res) => {
  await exporter.groupedAnalyticsToExcel(res, {
    tournamentId: req.query.tournamentId,
    discipline: req.query.discipline,
    stateCode: req.user.role === 'state_coordinator' ? req.user.stateCode : req.query.stateCode,
  });
}));

router.get('/analytics.pdf', requireRole('admin', 'state_coordinator'), ah(async (req, res) => {
  await exporter.groupedAnalyticsToPdf(res, req.user, {
    tournamentId: req.query.tournamentId,
    discipline: req.query.discipline,
    stateCode: req.user.role === 'state_coordinator' ? req.user.stateCode : req.query.stateCode,
  }, { ip: req.ip });
}));

router.get('/seasons/:id.pdf', requireRole('admin', 'state_coordinator'), ah(async (req, res) => {
  await exporter.seasonalReportToPdf(res, req.user, req.params.id, { ip: req.ip });
}));

router.get('/seasons/:id', requireRole('admin', 'state_coordinator'), ah(async (req, res) => {
  const report = await reportService.seasonalTournamentReport({ tournamentId: req.params.id });
  res.json(report);
}));

router.get('/applications/:id.pdf', ah(async (req, res) => {
  await exporter.applicationToPdf(res, req.params.id, req.user, { ip: req.ip });
}));

router.get('/applications/:id.paper', ah(async (req, res) => {
  res.json({ paper: await exporter.applicationToPaper(req.params.id, req.user) });
}));

module.exports = router;

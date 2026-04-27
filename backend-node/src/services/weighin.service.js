const { weighIns, applications } = require('../repositories');
const { write: auditWrite } = require('../audit');
const webhookService = require('./webhook.service');

function map(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id,
    weightKg: row.weight_kg !== null ? Number(row.weight_kg) : null,
    photoUrl: row.photo_url,
    notes: row.notes,
    weighedBy: row.weighed_by,
    weighedByName: row.weighed_by_name || null,
    weighedAt: row.weighed_at,
    firstName: row.first_name,
    lastName: row.last_name,
    weightClass: row.weight_class,
    discipline: row.discipline,
    clubName: row.club_name,
  };
}

async function recordWeighIn({ applicationId, weightKg, photoUrl, notes, actor }) {
  const application = await applications.findById(applicationId);
  if (!application) throw Object.assign(new Error('application not found'), { status: 404, code: 'NOT_FOUND' });
  const row = await weighIns.create({
    applicationId,
    weightKg,
    photoUrl: photoUrl || null,
    notes: notes || null,
    weighedBy: actor?.id || null,
  });
  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'weighin.record',
    entityType: 'application',
    entityId: applicationId,
    payload: { weightKg, hasPhoto: !!photoUrl },
  });
  webhookService.emitAsync('weighin.recorded', {
    applicationId,
    weighInId: row.id,
    weightKg: Number(row.weight_kg),
    weighedAt: row.weighed_at,
  });
  return map(row);
}

async function listForApplication(applicationId) {
  const rows = await weighIns.listForApplication(applicationId);
  return rows.map(map);
}

async function listForTournament(tournamentId, options = {}) {
  const rows = await weighIns.listForTournament(tournamentId, options);
  return rows.map(map);
}

module.exports = { recordWeighIn, listForApplication, listForTournament };

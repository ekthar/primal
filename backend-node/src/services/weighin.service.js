const { weighIns, applications, profiles: profilesRepo } = require('../repositories');
const { write: auditWrite } = require('../audit');
const webhookService = require('./webhook.service');
const divisionService = require('./division.service');
const { deriveOfficialWeightClass } = require('../domain/categoryRules');
const { logger } = require('../logger');

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

/** Round to 2 decimals without the 0.1*10/10 rounding drift. */
function normaliseWeightKg(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Math.round(n * 100) / 100 is exact for all weigh-in granularities we accept.
  return Math.round(n * 100) / 100;
}

async function recordWeighIn({ applicationId, weightKg, photoUrl, notes, actor }) {
  const application = await applications.findById(applicationId);
  if (!application) throw Object.assign(new Error('application not found'), { status: 404, code: 'NOT_FOUND' });
  const normalised = normaliseWeightKg(weightKg);
  const row = await weighIns.create({
    applicationId,
    weightKg: normalised,
    photoUrl: photoUrl || null,
    notes: notes || null,
    weighedBy: actor?.id || null,
  });

  // Propagate the official weigh-in into the profile so seeding, bracket
  // generation and approved-participant exports all agree on the same
  // weight. Re-derive the canonical weight class while we're here — if
  // the fighter walked in heavier/lighter than expected, they may need
  // to be moved to a different bracket.
  const profile = await profilesRepo.findById(application.profile_id);
  let weightClassChanged = false;
  if (profile) {
    const selectedDisciplines = Array.isArray(profile.metadata?.selectedDisciplines)
      ? profile.metadata.selectedDisciplines
      : [];
    const derivedWeightClass = deriveOfficialWeightClass({
      disciplineId: selectedDisciplines[0] || profile.discipline,
      gender: profile.gender,
      dateOfBirth: profile.date_of_birth,
      weightKg: normalised,
    });
    const nextWeightClass = derivedWeightClass || profile.weight_class || null;
    weightClassChanged = (profile.weight_class || null) !== nextWeightClass;
    try {
      await profilesRepo.updateWeightByProfileId(profile.id, {
        weightKg: normalised,
        weightClass: nextWeightClass,
      });
    } catch (err) {
      logger.error({ err, profileId: profile.id }, 'weighin.profile_update_failed');
    }
  }

  // Resync divisions so the fighter lands in the correct weight class bracket
  // if they weighed into a different band. Non-fatal: if the sync throws (e.g.
  // some other approved application is missing data) we still want the
  // weigh-in itself to succeed.
  if (application.tournament_id) {
    try {
      await divisionService.syncTournamentSystem(application.tournament_id);
    } catch (err) {
      logger.error(
        { err, tournamentId: application.tournament_id, applicationId },
        'weighin.division_sync_failed',
      );
    }
  }

  await auditWrite({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'weighin.record',
    entityType: 'application',
    entityId: applicationId,
    payload: { weightKg: normalised, hasPhoto: !!photoUrl, weightClassChanged },
  });
  webhookService.emitAsync('weighin.recorded', {
    applicationId,
    weighInId: row.id,
    weightKg: normalised,
    weightClassChanged,
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

module.exports = { recordWeighIn, listForApplication, listForTournament, normaliseWeightKg };

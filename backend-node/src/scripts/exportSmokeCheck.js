require('dotenv').config();

const { query } = require('../db');
const exporter = require('../services/export.service');

async function resolveApplicationId() {
  const explicitId = process.env.EXPORT_SMOKE_APPLICATION_ID;
  if (explicitId) return explicitId;

  const { rows } = await query(`
    SELECT id
    FROM applications
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  return rows[0]?.id || null;
}

async function main() {
  const applicationId = await resolveApplicationId();
  if (!applicationId) {
    throw new Error('No application found for export smoke check');
  }

  const smoke = await exporter.applicationExportSmoke(applicationId, { id: null, role: 'admin' });
  const failedChecks = Object.entries(smoke.checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  if (failedChecks.length) {
    throw new Error(`Export smoke check failed for ${applicationId}: ${failedChecks.join(', ')}`);
  }

  console.log(JSON.stringify({
    applicationId: smoke.applicationId,
    verificationUrl: smoke.verificationUrl,
    checks: smoke.checks,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

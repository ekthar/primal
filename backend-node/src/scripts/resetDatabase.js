require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool, transaction, query } = require('../db');
const { logger } = require('../logger');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function resetSchema() {
  if (process.env.CONFIRM_DB_RESET !== 'YES') {
    throw new Error('Refusing to reset database. Set CONFIRM_DB_RESET=YES to continue.');
  }

  await query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
    GRANT ALL ON SCHEMA public TO CURRENT_USER;
  `);
}

async function ensureMigrationTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function applyMigrations() {
  await ensureMigrationTable();
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    logger.info({ migration: file }, 'Applying migration');
    await transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
  }
}

async function run() {
  await resetSchema();
  await applyMigrations();
  logger.info('Database reset and migrations completed.');
}

run()
  .catch((error) => {
    logger.error({ err: error }, 'Database reset failed');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

#!/usr/bin/env node
// Minimal, idempotent SQL migration runner.
// Applies every .sql file in src/migrations in lexical order
// and records applied migrations in schema_migrations table.

const fs = require('fs');
const path = require('path');
const { pool, transaction, query } = require('../db');
const { logger } = require('../logger');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function appliedSet() {
  const { rows } = await query('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

async function run() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.warn('No migrations directory found.');
    return;
  }
  await ensureTable();
  const done = await appliedSet();
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) {
      logger.info(`↷  ${file} already applied`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    logger.info(`→  applying ${file}`);
    await transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
    logger.info(`✓  ${file} applied`);
  }
  logger.info('All migrations up to date.');
}

run()
  .catch((err) => {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  })
  .finally(() => pool.end());

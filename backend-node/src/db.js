require('dotenv').config();

const { Pool } = require('pg');
const { performance } = require('perf_hooks');
const { config } = require('./config');
const { logger } = require('./logger');

const pool = new Pool(
  config.db.url
    ? {
        connectionString: config.db.url,
        ssl: config.db.ssl
          ? { rejectUnauthorized: config.db.sslRejectUnauthorized }
          : false,
      }
    : {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password,
        ssl: config.db.ssl
          ? { rejectUnauthorized: config.db.sslRejectUnauthorized }
          : false,
      }
);

/** Run a query and return rows. */
async function query(text, params) {
  const start = performance.now();
  try {
    const res = await pool.query(text, params);
    const durationMs = performance.now() - start;
    if (durationMs >= config.observability.slowQueryMs) {
      logger.warn({
        durationMs: Number(durationMs.toFixed(1)),
        rowCount: res.rowCount,
        statement: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      }, 'Slow database query');
    }
    return res;
  } catch (err) {
    const durationMs = performance.now() - start;
    logger.error({
      err,
      durationMs: Number(durationMs.toFixed(1)),
      statement: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    }, 'Database query failed');
    throw err;
  }
}

/** Run callback inside a transaction; commits on success, rolls back on throw. */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction };

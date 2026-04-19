const { Pool } = require('pg');
const { config } = require('./config');

const pool = new Pool(
  config.db.url
    ? { connectionString: config.db.url, ssl: config.db.ssl ? { rejectUnauthorized: false } : false }
    : {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password,
        ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      }
);

/** Run a query and return rows. */
async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
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

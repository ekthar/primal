const app = require('../server');
const { logger } = require('../src/logger');

logger.info({
  coldStart: true,
  runtime: 'vercel-node',
  region: process.env.VERCEL_REGION || null,
  env: process.env.NODE_ENV || 'development',
  bootedAt: new Date().toISOString(),
}, 'API function booted');

module.exports = app;

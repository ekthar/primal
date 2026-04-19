const pino = require('pino');
const { config } = require('./config');

const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  transport:
    config.env === 'production'
      ? undefined
      : {
          target: 'pino/file',
          options: { destination: 1 },
        },
});

module.exports = { logger };

const path = require('path');

// __basedir is the path of root directory
// has same value when used in any js file in this project
global.__basedir = path.join(__dirname, '..');

require('dotenv-safe').config({ example: '.env.default' });
// require('./db');
const config = require('config');
const app = require('./app');
const logger = require('./services/logger');

const port = config.get('express.port');
const host = config.get('express.host');
const server = app.listen(port, () => {
  logger.info(`Listening: http://${host}:${port}`);
});

const shutdown = () => {
  logger.warn('server: closing');
  server.close((err) => {
    if (err) {
      logger.error('server: closed with ERROR', err);
      process.exit(1);
    }
    logger.warn('server: closed');
    process.exit();
  });
};

process.on('SIGINT', () => {
  logger.warn('process received SIGINT');
  shutdown();
});

process.on('SIGTERM', () => {
  logger.warn('process received SIGTERM');
  shutdown();
});

const path = require('path');

// __basedir is the path of root directory
// has same value when used in any js file in this project
global.__basedir = path.join(__dirname, '..');

require('dotenv-safe').config();
require('./db');
const config = require('config');
const app = require('./app');
const logger = require('./core/logger');
const {
  onApplicationBootstrap,
  beforeApplicationShutdown,
  onApplicationShutdown,
} = require('./core/lifecycle');
const { safeAwait } = require('./utils');

async function main() {
  await onApplicationBootstrap();

  const port = config.get('express.port');
  const host = config.get('express.host');
  const server = app.listen(port, () => {
    logger.info(`Listening: http://${host}:${port}`);
  });

  const shutdown = async () => {
    await safeAwait(beforeApplicationShutdown());
    logger.warn('server: closing');
    server.close(async (err) => {
      if (err) {
        logger.error('server: closed with ERROR', err);
        process.exit(1);
      }
      await safeAwait(onApplicationShutdown());
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
}

main().catch((err) => {
  logger.error('Error in main:', err);
  process.exit(1);
});

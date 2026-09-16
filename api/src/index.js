// entry point of the application
const { performance } = require('perf_hooks');

const start = performance.now();

require('module-alias/register');
const path = require('path');

// __basedir is the path of the root directory
// has the same value when used in any JS file in this project
global.__basedir = path.join(__dirname, '..');

// Load environment variables and validate against .env.default
require('dotenv-safe').config({ example: '.env.default' });

require('./db');
const config = require('config');
const app = require('./app');
const logger = require('./services/logger');
const { validateGrantAccessTypes } = require('./scripts/validateGrantAccessTypes');
const { getAccessTypeClosure } = require('./services/grants/accessTypeClosure');
const { verifyInSync } = require('./state');
const { registerHandlers } = require('./notification/notificationBus');
const { closeAllQueues } = require('./notification/queue/queues');

// Register notification handlers
registerHandlers();

// log a warning when auto sign up is enabled
if (config.get('auth.auto_sign_up.enabled')) {
  logger.warn(`⚠️ Auto sign up (default role: "${config.get('auth.auto_sign_up.default_role')}") is enabled. \
If this is not intended, please disable it in the configuration. \
This feature can be exploited to create multiple user accounts without rate limiting.‼️\n`);
}

const port = config.get('express.port');
const host = config.get('express.host');

async function init() {
  await validateGrantAccessTypes();
  // The state rules and the policy containers must describe the same actions. A mismatch is a
  // renamed action whose state check was dropped, so the process refuses to start.
  // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
  verifyInSync();
  // Build the access-type closure before serving, so the first request does not pay for it
  // and a cyclic graph stops the process rather than one request.
  // @see docs/design/groups/decisions.md — 7. Access types imply one another
  await getAccessTypeClosure();

  const server = app.listen(port, () => {
    const end = performance.now();
    logger.info(`Server initialized in ${(end - start).toFixed(2)} ms`);
    logger.info(`Listening: http://${host}:${port}`);
  });

  const shutdown = async () => {
    logger.warn('server: closing');
    await closeAllQueues();
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
}

init().catch((err) => {
  logger.error(err);
  process.exit(1);
});

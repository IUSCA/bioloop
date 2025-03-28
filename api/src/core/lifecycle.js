const fs = require('node:fs');
const config = require('config');
const logger = require('./logger');
const swagger = require('../scripts/swagger');
const { registerCronJobs } = require('./cron');

// run only in master process before forking workers
async function beforeApplicationFork() {
  logger.debug('Before Application Fork: Running master process tasks (one-time setup)');

  if (!fs.existsSync(swagger.outputFile)) {
    await swagger.generate();
  }

  registerCronJobs();
}

async function onApplicationBootstrap() {
  if (config.get('auth.auto_sign_up.enabled')) {
    logger.warn(`⚠️ Auto sign up (default role: "${config.get('auth.auto_sign_up.default_role')}") is enabled. \
    If this is not intended, please disable it in the configuration. \
    This feature can be exploited to create multiple user accounts without rate limiting.‼️\n`);
  }
  logger.debug('On Application Bootstrap');
}

// run in worker processes when shutting down before closing the server
async function beforeApplicationShutdown() {
  logger.debug('Before Application Shutdown');
}

// run in worker processes after closing the server
async function onApplicationShutdown() {
  logger.debug('On Application Shutdown');
}

module.exports = {
  beforeApplicationFork,
  onApplicationBootstrap,
  beforeApplicationShutdown,
  onApplicationShutdown,
};

const path = require('path');

const pino = require('pino');
const pinoCaller = require('pino-caller');
const config = require('config');

function createDevLogger() {
  const logger = pino({
    level: config.get('logger.level'),
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }, // Add color for better visibility
    },
  });

  const loggerWithCaller = pinoCaller(logger, { relativeTo: global.__basedir });
  return loggerWithCaller;
}

/**
 * Creates a Pino logger instance for a given task
 * @param {string} taskName - Name of the task
 * @returns {pino.Logger} - Pino logger instance
 */
function createTaskLogger(taskName) {
  return pino({
    level: config.get('logger.level'),
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: {
      target: 'pino/file',
      options: {
        destination: path.join(global.__basedir, `logs/${taskName}.log`), // Log to task-specific file
        mkdir: true, // Ensure directory exists
      },
    },
  });
}

// https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/#adding-context-to-your-logs
// logger.error(
//   { transaction_id: '12343_ff', user_id: 'johndoe' },
//   'Transaction failed'
// );

// try {
//   alwaysThrowError();
// } catch (err) {
//   logger.error(err, 'An unexpected error occurred while processing the request');
// }

module.exports = {
  logger: config.get('mode') === 'production' ? createTaskLogger('app') : createDevLogger(),
  createTaskLogger,
};

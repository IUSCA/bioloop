const { writeSync } = require('node:fs');

let installed = false;

function reportFatalError(reason, origin) {
  const error = reason instanceof Error ? reason : new Error(
    typeof reason === 'string' ? reason : 'Unhandled promise rejection with a non-Error reason',
  );

  // Fatal logs must reach stderr before exit; an asynchronous transport may lose its buffer.
  writeSync(2, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    event: 'api.fatal',
    origin,
    pid: process.pid,
    message: error.message,
    stack: error.stack,
  })}\n`);
}

function registerProcessErrorMonitoring() {
  if (installed) return;
  installed = true;

  // Observe uncaught exceptions without suppressing Node's default non-zero exit.
  process.on('uncaughtExceptionMonitor', reportFatalError);
  process.on('unhandledRejection', (reason) => {
    try {
      reportFatalError(reason, 'unhandledRejection');
    } finally {
      // Also fail fast when Node was started with a non-fatal unhandled-rejection mode.
      process.exit(1);
    }
  });
}

module.exports = registerProcessErrorMonitoring;

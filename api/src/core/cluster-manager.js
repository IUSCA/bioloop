/* eslint-disable no-console */
const cluster = require('node:cluster');
const os = require('node:os');
const process = require('node:process');
const { RateLimiterMemory } = require('rate-limiter-flexible');

/**
 * Manages a cluster of worker processes with configurable options for scaling,
 * restart limits, and graceful shutdown.
 *
 * @param {Object} options - Configuration options for the cluster manager.
 * @param {Function} [options.master=null] - Optional callback to execute in the master process.
 * @param {Function} options.worker - Callback to execute in each worker process.
 * @param {Function} [options.beforeApplicationFork=null] - Optional callback to execute before forking workers.
 * @param {number} [options.count=2] - Desired number of worker processes (default is 2).
 * @param {number} [options.max_restarts=3] - Maximum number of worker restarts allowed within the interval.
 * @param {number} [options.max_restarts_interval=10000] - Time interval (in milliseconds) for the restart limit.
 * @param {number} [options.grace=5000] - Grace period (in milliseconds) for workers to shut down gracefully.
 * @param {string[]} [options.signals=['SIGINT', 'SIGTERM']] - List of signals to listen for to trigger shutdown.
 *
 * @returns {void}
 *
 * @example
 * manage_cluster({
 *   master: () => console.log('Master process running'),
 *   worker: () => setInterval(() => console.log('Worker process running'), 1000),
 *   count: 4,
 *   max_restarts: 5,
 *   max_restarts_interval: 15000,
 *   grace: 3000,
 *   signals: ['SIGINT', 'SIGTERM', 'SIGHUP'],
 * });
 */
async function manage_cluster({
  master = null,
  worker,
  beforeApplicationFork = null,
  count = 2,
  max_restarts = 3,
  max_restarts_interval = 10000,
  grace = 5000,
  signals = ['SIGINT', 'SIGTERM'],
}) {
  const numCPUs = Math.min(count, os.availableParallelism());

  if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);

    // Execute the optional callback before forking workers
    if (beforeApplicationFork) {
      await beforeApplicationFork();
    }

    let activeWorkers = numCPUs;
    let exiting = false;
    const restartLimiter = new RateLimiterMemory({
      points: max_restarts,
      duration: max_restarts_interval / 1000, // seconds
    });

    for (let i = 0; i < numCPUs; i += 1) {
      cluster.fork();
    }

    cluster.on('exit', async (_worker, code, signal) => {
      activeWorkers -= 1;
      console.log(`Worker ${_worker.process.pid} died (${signal || code})`);

      if (!exiting) {
        try {
          await restartLimiter.consume('restart');
          console.log('Restarting worker...');
          activeWorkers += 1;
          cluster.fork();
        } catch {
          console.log('Restart limit reached, not spawning new workers.');
        }
      }

      if (activeWorkers === 0) {
        console.log('All workers have exited. Shutting down master...');
        if (exiting) {
          process.exit(0);
        }
        process.exit(1);
      }
    });

    // let shutdownMaster;
    const shutdown = async () => {
      // If the shutdown function is already called, do nothing to prevent multiple calls
      if (exiting) return;

      console.log('Shutting down cluster...');
      exiting = true;

      Object.values(cluster.workers).forEach((_worker) => _worker.process.kill('SIGTERM'));
      // unref- If there is no other activity keeping the event loop running,
      // the process may exit before the Timeout object's callback is invoked.
      setTimeout(() => process.exit(1), grace).unref();

      // try {
      //   await shutdownMaster?.();
      // } catch (error) {
      //   console.error('Error during master shutdown:', error);
      // } finally {
      //   Object.values(cluster.workers).forEach((_worker) => _worker.process.kill('SIGTERM'));
      //   // unref- If there is no other activity keeping the event loop running,
      //   // the process may exit before the Timeout object's callback is invoked.
      //   setTimeout(() => process.exit(1), grace).unref();
      // }
    };

    signals.forEach((signal) => process.on(signal, shutdown));
    master?.();
  } else {
    console.log(`Worker ${process.pid} started`);
    worker?.();
  }
}

module.exports = manage_cluster;

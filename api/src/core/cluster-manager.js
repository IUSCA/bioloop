/* eslint-disable no-console */
const cluster = require('node:cluster');
const os = require('node:os');
const process = require('node:process');
const { RateLimiterMemory } = require('rate-limiter-flexible');

function manage_cluster({
  master, worker, count, max_restarts, max_restarts_interval, grace, signals,
}) {
  const numCPUs = Math.min(count, os.availableParallelism());

  if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);

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

/**
 * src/notification/queue/queues.js
 *
 * Creates and caches Bull queue instances.
 * Imported by BOTH your API cluster (to enqueue jobs) and the worker process (to process jobs).
 *
 * The split:
 *   API cluster instances  →  call queue.add()      (produce jobs)
 *   Worker process         →  calls queue.process()  (consume jobs)
 *
 * Bull handles multiple producers → single consumer pool safely via Redis.
 */

const Bull = require('bull');
const config = require('config');
const logger = require('@/services/logger');

const REDIS_CONNECTION = {
  host: config.get('redis.host'),
  port: config.get('redis.port'),
  password: config.get('redis.password'),
  // Auto-reconnect with backoff
  retryStrategy: (times) => Math.min(times * 500, 5000),
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
};

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // 5s → 10s → 20s
  },
  removeOnComplete: 50, // keep last 50 completed jobs for inspection
  removeOnFail: 200, // keep last 200 failed jobs for debugging
};

// Module-level cache — one Queue instance per name, per process
const _queues = new Map();

/**
 * Returns (or lazily creates) a Bull queue by name.
 * Safe to call from multiple modules — always returns the same instance.
 *
 * @param {string} queueName
 * @returns {import('bull').Queue}
 */
function getQueue(queueName) {
  if (_queues.has(queueName)) return _queues.get(queueName);

  const queue = new Bull(queueName, {
    redis: REDIS_CONNECTION,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  queue.on('error', (err) => {
    logger.error(`[Queue:${queueName}] Redis error`, err);
  });

  _queues.set(queueName, queue);
  logger.info(`[Queue] Initialized: ${queueName}`);
  return queue;
}

/**
 * Gracefully close all queues (drain in-flight jobs, disconnect from Redis).
 * Call this inside your graceful shutdown handler in worker.js and server.js.
 */
async function closeAllQueues() {
  await Promise.all([..._queues.values()].map((q) => q.close()));
  logger.info('[Queue] All queues closed');
}

module.exports = { getQueue, closeAllQueues };

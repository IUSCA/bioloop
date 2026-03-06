/**
 * src/notification/worker.js
 *
 * ══════════════════════════════════════════════════════════════════
 * DEDICATED WORKER PROCESS
 * Run by PM2 as a separate fork process — NOT part of your cluster.
 * ══════════════════════════════════════════════════════════════════
 *
 * This is the ONLY file in the system that calls queue.process().
 * This is the ONLY file that runs cron jobs.
 *
 * Your PM2 ecosystem.config.js entry for this process:
 *
 *   {
 *     name:      'notification-worker',
 *     script:    'src/notification/worker.js',
 *     exec_mode: 'fork',   ← MUST be fork, not cluster
 *     instances: 1,        ← MUST be 1 to prevent duplicate cron firing
 *     watch:     false,
 *   }
 *
 * Flow:
 *   API cluster instance  →  NotificationService.send*()  →  queue.add()  →  Redis
 *   This worker           ←  queue.process()              ←  Redis
 *                         →  renderTemplate()
 *                         →  sendMail() → Postfix → university MX
 */

require('module-alias/register');
const path = require('path');

// __basedir is the path of the root directory
// has the same value when used in any JS file in this project
global.__basedir = path.join(__dirname, '..', '..');

// Load environment variables and validate against .env.example
require('dotenv-safe').config({ example: '.env.default' });

const config = require('config');
const logger = require('@/services/logger');
const { getQueue, closeAllQueues } = require('./queue/queues');
const { QUEUE_NAMES } = require('./types');
const {
  renderTemplate,
  preloadTemplates,
} = require('./email/templateRenderer');
const { sendMail, verifyConnection } = require('./email/mailer');
const scheduleCronJobs = require('./cron');

// ── Job processor ─────────────────────────────────────────────────

/**
 * Processes a single email job dequeued from Bull.
 *
 * Job payload shape (set by NotificationService._enqueue):
 * {
 *   type:     string,    // notification type constant
 *   to:       string[],  // recipient addresses
 *   subject:  string,
 *   template: string,    // name of .hbs template file (without extension)
 *   data:     object,    // variables injected into the template
 * }
 *
 * @param {import('bull').Job} job
 */
async function processEmailJob(job) {
  const {
    type, to, subject, template, data,
  } = job.data;

  logger.info('[Worker] Processing job', {
    jobId: job.id,
    type,
    template,
    recipients: to.length,
  });

  // 1. Render HTML + plain text from Handlebars template
  const { html, text } = await renderTemplate(template, {
    ...data,
    _meta: {
      type,
      generatedAt: new Date().toISOString(),
    },
  });

  // 2. Send via Nodemailer → host Postfix relay
  await sendMail({
    to: to.join(', '), subject, html, text,
  });

  logger.info('[Worker] Job completed', {
    jobId: job.id,
    type,
    recipients: to.length,
  });
}

// ── Register processors on all queues ────────────────────────────

function startWorkers() {
  const concurrency = config.get('notify.worker.concurrency');

  for (const queueName of QUEUE_NAMES) {
    const queue = getQueue(queueName);

    queue.process(concurrency, async (job) => {
      try {
        await processEmailJob(job);
      } catch (err) {
        logger.error('[Worker] Job processing error', {
          jobId: job.id,
          queue: queueName,
          error: err.message,
          attempt: job.attemptsMade,
        });
        // Re-throw so Bull records the failure and schedules the retry
        throw err;
      }
    });

    queue.on('completed', (job) => {
      logger.debug('[Worker] Job completed', { jobId: job.id, queue: queueName });
    });

    queue.on('failed', (job, err) => {
      logger.error('[Worker] Job failed (all retries exhausted)', {
        jobId: job.id,
        queue: queueName,
        error: err.message,
      });
    });

    queue.on('stalled', (job) => {
      logger.warn('[Worker] Job stalled — will be retried', {
        jobId: job.id,
        queue: queueName,
      });
    });

    logger.info(`[Worker] Processor registered on: ${queueName} (concurrency: ${concurrency})`);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────

async function shutdown(signal) {
  logger.info(`[Worker] ${signal} received — shutting down gracefully`);
  // closeAllQueues() waits for in-flight jobs to complete before disconnecting
  await closeAllQueues();
  logger.info('[Worker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('[Worker] Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Worker] Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

// ── Startup ───────────────────────────────────────────────────────

async function start() {
  logger.info('[Worker] Starting notification worker', {
    nodeEnv: config.get('env'),
    concurrency: config.get('notify.worker.concurrency'),
    queues: QUEUE_NAMES,
    smtpHost: config.get('smtp.host'),
    redisHost: config.get('redis.host'),
  });

  // Pre-compile all Handlebars templates (prevents cold-start delay on first job)
  preloadTemplates();

  // Check SMTP relay is reachable (warning only — jobs survive transient SMTP outages)
  await verifyConnection();

  // Register Bull job processors — worker is now consuming from all queues
  startWorkers();

  // Start cron jobs — ONLY here, preventing duplicate execution across cluster instances
  scheduleCronJobs();

  logger.info('[Worker] Ready — waiting for jobs');
}

start();

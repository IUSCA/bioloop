/**
 * src/notification/cron.js
 *
 * Scheduled jobs. Imported ONLY by worker.js.
 * Runs in the single fork worker process, so jobs fire exactly once
 * regardless of how many PM2 cluster instances your API is running.
 *
 * Adding a new scheduled job:
 *   1. Write a handler function
 *   2. Add a cron.schedule() call in scheduleCronJobs()
 *   3. Done — no other files need to change
 *
 * Cron expression reference: https://crontab.guru
 */

const cron = require('node-cron');
const config = require('config');
const logger = require('@/services/logger');
const accessRequestsService = require('@/services/access_requests');
const NotificationService = require('./NotificationService');

// ── Data fetchers (replace with your actual DB queries) ───────────

/**
 * Return users who have daily digest enabled.
 * Each entry needs: { email: string, items: { title, body, url? }[] }
 *
 * Replace this stub with your real database query, e.g.:
 *   return db.users.findAll({ where: { digestEnabled: true }, include: ['pendingItems'] });
 *
 * @returns {Promise<{ email: string, items: object[] }[]>}
 */
async function fetchDailyDigestRecipients() {
  // TODO: replace with your DB query
  return [];
}

// ── Job handlers ──────────────────────────────────────────────────

async function runDailyDigest() {
  logger.info('[Cron] Daily digest starting');

  let recipients;
  try {
    recipients = await fetchDailyDigestRecipients();
  } catch (err) {
    logger.error('[Cron] Failed to fetch digest recipients', { error: err.message });
    return;
  }

  if (recipients.length === 0) {
    logger.info('[Cron] Daily digest: no recipients today');
    return;
  }

  // Send personalized digest to each user.
  // Promise.allSettled so one failure does not abort the rest.
  const results = await Promise.allSettled(
    recipients.map(({ email, items }) => NotificationService.sendDigest({
      to: [email],
      subject: `Your Daily Digest — ${new Date().toLocaleDateString('en-GB')}`,
      period: 'Daily',
      items,
    })),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  logger.info('[Cron] Daily digest complete', {
    total: recipients.length,
    enqueued: recipients.length - failed,
    failed,
  });
}

/**
 * Close access requests nobody has reviewed.
 *
 * `expireStaleRequests` moves an `UNDER_REVIEW` request older than the cutoff to `EXPIRED`
 * and writes one audit record per request. Without this job a request would sit
 * `UNDER_REVIEW` forever.
 *
 * @see docs/design/groups/design.md — Notifications and expiry
 */
async function runAccessRequestExpiry() {
  const { max_age_days } = config.get('notify.cron.access_request_expiry');
  logger.info('[Cron] Access request expiry starting', { max_age_days });

  try {
    const expired = await accessRequestsService.expireStaleRequests({ max_age_days });
    logger.info('[Cron] Access request expiry complete', { expired });
  } catch (err) {
    logger.error('[Cron] Access request expiry failed', { error: err.message });
  }
}

// ── Schedule registration ─────────────────────────────────────────

function scheduleCronJobs() {
  const timezone = config.get('notify.cron.timezone');

  // Daily digest — every day at 07:00
  cron.schedule('0 7 * * *', runDailyDigest, { timezone });

  // Access request expiry — overnight, when nobody is mid-review
  cron.schedule(
    config.get('notify.cron.access_request_expiry.schedule'),
    runAccessRequestExpiry,
    { timezone },
  );

  // ── Examples of other schedules you might add: ─────────────────

  // Weekly digest — every Monday at 08:00
  // cron.schedule('0 8 * * 1', runWeeklyDigest, { timezone });

  // Automated health alert — every 5 minutes
  // cron.schedule('*/5 * * * *', async () => {
  //   const ok = await checkSystemHealth();
  //   if (!ok) {
  //     await NotificationService.sendAlert({
  //       to:         ['admin@university.edu'],
  //       subject:    'Automated health check failed',
  //       alertTitle: 'System Health Check Failed',
  //       alertBody:  'An automated check detected a problem.',
  //       severity:   'critical',
  //     });
  //   }
  // });

  logger.info('[Cron] Scheduled jobs registered');
}

module.exports = scheduleCronJobs;

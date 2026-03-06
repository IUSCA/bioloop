/**
 * src/notification/NotificationService.js
 *
 * ══════════════════════════════════════════════════════════════════
 * THIS IS THE ONLY FILE YOUR APPLICATION CODE IMPORTS.
 * ══════════════════════════════════════════════════════════════════
 *
 * Usage anywhere in your existing Express app:
 *
 *   const notify = require('./notification/NotificationService');  // path from YOUR app root
 *
 *   // After a DB save:
 *   await notify.sendAlert({ to: ['admin@uni.edu'], ... });
 *
 *   // Fire-and-forget (don't block the request):
 *   notify.sendWorkflowUpdate({ ... }).catch(err => logger.error(err));
 *
 * All methods:
 *   - Return Promise<Bull.Job> — resolves when job is queued, NOT when email is sent
 *   - Are safe to call from any PM2 cluster instance
 *   - Never block your request handlers
 *   - Are retried automatically on failure (3× with exponential backoff)
 */

const logger = require('@/services/logger');
const { getQueue } = require('./queue/queues');
const { TYPES, QUEUE_ROUTING } = require('./types');

class NotificationService {
  // ── Core dispatcher ──────────────────────────────────────────────
  //
  // All public send*() methods call this.
  // You should never need to call _enqueue() directly.

  async _enqueue({
    type, to, subject, template, data = {}, jobOpts = {},
  }) {
    const routing = QUEUE_ROUTING[type];
    if (!routing) {
      throw new Error(`[NotificationService] Unknown notification type: "${type}"`);
    }

    const recipients = this._normalizeRecipients(to);
    if (recipients.length === 0) {
      throw new Error('[NotificationService] No valid recipients provided');
    }

    const queue = getQueue(routing.queueName);

    const job = await queue.add(
      // Job payload — received by the worker process
      {
        type, to: recipients, subject, template, data,
      },
      // Bull job options
      { priority: routing.priority, ...jobOpts },
    );

    logger.info('[Notify] Job enqueued', {
      jobId: job.id,
      type,
      queue: routing.queueName,
      priority: routing.priority,
      recipients: recipients.length,
    });

    return job;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Send a critical or warning alert.
   * Uses the high-priority queue — processed before workflows and requests.
   *
   * @param {object}          opts
   * @param {string|string[]} opts.to           - one or more recipient email addresses
   * @param {string}          opts.subject      - email subject line
   * @param {string}          opts.alertTitle   - bold heading shown in the email body
   * @param {string}          opts.alertBody    - main message text
   * @param {'critical'|'warning'|'info'} [opts.severity='warning']
   * @param {string}          [opts.actionUrl]  - optional CTA button URL
   * @param {string}          [opts.actionLabel]- optional CTA button label
   * @returns {Promise<import('bull').Job>}
   *
   * @example
   * await notify.sendAlert({
   *   to: ['admin@university.edu'],
   *   subject: 'Disk usage at 95%',
   *   alertTitle: 'Storage Critical',
   *   alertBody: 'Server fs-01 is at 95% disk usage.',
   *   severity: 'critical',
   *   actionUrl: 'https://portal.uni.edu/servers/fs-01',
   * });
   */
  sendAlert({
    to, subject, alertTitle, alertBody, severity = 'warning', actionUrl, actionLabel,
  }) {
    return this._enqueue({
      type: TYPES.ALERT,
      to,
      subject,
      template: 'alert',
      data: {
        alertTitle, alertBody, severity, actionUrl, actionLabel,
      },
    });
  }

  /**
   * Send a workflow status update (step completed, approval needed, rejected…).
   *
   * @param {object}          opts
   * @param {string|string[]} opts.to
   * @param {string}          opts.subject
   * @param {string}          opts.workflowName
   * @param {string}          opts.stepName
   * @param {'completed'|'pending'|'failed'|'approved'|'rejected'} opts.status
   * @param {string}          opts.message
   * @param {string}          [opts.actionUrl]
   * @param {string}          [opts.actionLabel]
   * @returns {Promise<import('bull').Job>}
   *
   * @example
   * await notify.sendWorkflowUpdate({
   *   to: ['jane@university.edu'],
   *   subject: 'Leave request approved',
   *   workflowName: 'Leave Approval',
   *   stepName: 'Manager Review',
   *   status: 'approved',
   *   message: 'Your leave request for 15–17 Jan has been approved.',
   *   actionUrl: 'https://portal.uni.edu/leave/123',
   * });
   */
  sendWorkflowUpdate({
    to, subject, workflowName, stepName, status, message, actionUrl, actionLabel,
  }) {
    return this._enqueue({
      type: TYPES.WORKFLOW,
      to,
      subject,
      template: 'workflow',
      data: {
        workflowName, stepName, status, message, actionUrl, actionLabel,
      },
    });
  }

  /**
   * Send an action request notification (access approval, task assignment…).
   *
   * @param {object}          opts
   * @param {string|string[]} opts.to
   * @param {string}          opts.subject
   * @param {string}          opts.requestType    - e.g. 'access', 'approval', 'task'
   * @param {string}          opts.requestTitle
   * @param {string}          opts.requesterName
   * @param {string}          opts.message
   * @param {string}          [opts.dueDate]
   * @param {string}          [opts.actionUrl]
   * @param {string}          [opts.actionLabel]
   * @returns {Promise<import('bull').Job>}
   *
   * @example
   * await notify.sendRequest({
   *   to: ['supervisor@university.edu'],
   *   subject: 'VPN Access Request — Jane Doe',
   *   requestType: 'access',
   *   requestTitle: 'VPN Access',
   *   requesterName: 'Jane Doe',
   *   message: 'Jane requires VPN access for remote research.',
   *   dueDate: '2024-02-01',
   *   actionUrl: 'https://portal.uni.edu/requests/456',
   *   actionLabel: 'Approve or Deny',
   * });
   */
  sendRequest({
    to, subject, requestType, requestTitle, requesterName, message, dueDate, actionUrl, actionLabel,
  }) {
    return this._enqueue({
      type: TYPES.REQUEST,
      to,
      subject,
      template: 'request',
      data: {
        requestType, requestTitle, requesterName, message, dueDate, actionUrl, actionLabel,
      },
    });
  }

  /**
   * Send a digest (daily / weekly summary).
   * Uses the low-priority queue — processed after alerts and workflow updates.
   * Typically called by cron.js, not directly from request handlers.
   *
   * @param {object}          opts
   * @param {string|string[]} opts.to
   * @param {string}          opts.subject
   * @param {string}          opts.period   - e.g. 'Daily', 'Weekly'
   * @param {{ title: string, body: string, url?: string }[]} opts.items
   * @returns {Promise<import('bull').Job>}
   *
   * @example
   * await notify.sendDigest({
   *   to: ['user@university.edu'],
   *   subject: 'Your Daily Digest — 24 Jan',
   *   period: 'Daily',
   *   items: [
   *     { title: '3 pending approvals', body: 'You have requests awaiting action.', url: 'https://...' },
   *     { title: 'Maintenance tonight', body: 'Portal offline 23:00–01:00.' },
   *   ],
   * });
   */
  sendDigest({
    to, subject, period, items,
  }) {
    return this._enqueue({
      type: TYPES.DIGEST,
      to,
      subject,
      template: 'digest',
      data: { period, items },
    });
  }

  /**
   * Send a system notification (maintenance notice, account changes, broadcasts).
   * Uses the high-priority queue — same as alerts.
   *
   * @param {object}          opts
   * @param {string|string[]} opts.to
   * @param {string}          opts.subject
   * @param {string}          opts.message
   * @param {string}          [opts.actionUrl]
   * @param {string}          [opts.actionLabel]
   * @returns {Promise<import('bull').Job>}
   *
   * @example
   * await notify.sendSystem({
   *   to: ['all-staff@university.edu'],
   *   subject: 'Scheduled maintenance this Sunday',
   *   message: 'The portal will be offline 23:00–01:00 GMT on Sunday 28 Jan.',
   *   actionUrl: 'https://status.university.edu',
   * });
   */
  sendSystem({
    to, subject, message, actionUrl, actionLabel,
  }) {
    return this._enqueue({
      type: TYPES.SYSTEM,
      to,
      subject,
      template: 'system',
      data: { message, actionUrl, actionLabel },
    });
  }

  // ── Helper ───────────────────────────────────────────────────────

  /** Accept a string or array, return a clean lowercase array. */
  // eslint-disable-next-line class-methods-use-this
  _normalizeRecipients(to) {
    return (Array.isArray(to) ? to : [to])
      .map((addr) => addr.trim().toLowerCase())
      .filter(Boolean);
  }
}

// Export singleton so all cluster instances share one in-process object.
// Each instance still gets its own Redis connection for enqueuing.
module.exports = new NotificationService();

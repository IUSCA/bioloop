/**
 * src/notification/notificationBus.js
 *
 * An EventEmitter bridge between your business logic and the notification system.
 *
 * WHY USE THIS instead of calling NotificationService directly?
 *   - Keeps your domain code unaware of email logic
 *   - You emit a business event; the handler decides what email to send
 *   - Adding/changing email content never touches your business code
 *
 * PM2 CLUSTER NOTE:
 *   This EventEmitter is in-process only. Each PM2 cluster instance has its own bus.
 *   That is fine — whichever instance handled the request also enqueues the job.
 *   Cross-process coordination is handled by Bull + Redis, not by this EventEmitter.
 *
 * ─────────────────────────────────────────────────────────────────
 * SETUP — call registerHandlers() ONCE in your existing app startup:
 *
 *   // In your app.js or server.js:
 *   const { registerHandlers } = require('./notification/notificationBus')  // <- from YOUR app root;
 *   registerHandlers();
 *
 * ─────────────────────────────────────────────────────────────────
 * USAGE — emit from anywhere in your existing code:
 *
 *   const { notificationBus, EVENTS } = require('./notification/notificationBus')  // <- from YOUR app root;
 *
 *   // After approving a leave request:
 *   notificationBus.emit(EVENTS.WORKFLOW_APPROVED, {
 *     to:           ['jane@university.edu'],
 *     workflowName: 'Leave Approval',
 *     stepName:     'Manager Review',
 *     message:      'Approved for 15–17 Jan.',
 *     actionUrl:    'https://portal.uni.edu/leave/123',
 *   });
 *
 * ─────────────────────────────────────────────────────────────────
 * ADDING A NEW EVENT:
 *   1. Add a constant to EVENTS
 *   2. Register a handler in registerHandlers()
 *   No other files need to change.
 */

const EventEmitter = require('events');
const logger = require('@/services/logger');
const NotificationService = require('./NotificationService');

// ── Event name constants ────────────────────────────────────────────
// Import and use these in your emitting code to avoid string typos.

const EVENTS = Object.freeze({
  // Alert events
  ALERT_TRIGGERED: 'alert.triggered',

  // Workflow events
  WORKFLOW_APPROVED: 'workflow.approved',
  WORKFLOW_REJECTED: 'workflow.rejected',
  WORKFLOW_UPDATED: 'workflow.updated',

  // Request events
  REQUEST_RECEIVED: 'request.received',
  REQUEST_COMPLETED: 'request.completed',

  // System events
  SYSTEM_BROADCAST: 'system.broadcast',
});

// ── Bus instance ───────────────────────────────────────────────────

class NotificationBus extends EventEmitter {}
const notificationBus = new NotificationBus();
notificationBus.setMaxListeners(20);

notificationBus.on('error', (err) => {
  logger.error('[NotificationBus] Unhandled bus error', { error: err.message });
});

// ── Handler registration ───────────────────────────────────────────

function registerHandlers() {
  // ── alert.triggered ─────────────────────────────────────────────
  // Payload: { to, title, body, severity?, actionUrl? }
  notificationBus.on(EVENTS.ALERT_TRIGGERED, async ({
    to, title, body, severity, actionUrl,
  }) => {
    try {
      await NotificationService.sendAlert({
        to,
        subject: `[Alert] ${title}`,
        alertTitle: title,
        alertBody: body,
        severity: severity || 'warning',
        actionUrl,
      });
    } catch (err) {
      logger.error('[NotificationBus] alert.triggered handler failed', { error: err.message });
    }
  });

  // ── workflow.approved ────────────────────────────────────────────
  // Payload: { to, workflowName, stepName?, message?, actionUrl? }
  notificationBus.on(EVENTS.WORKFLOW_APPROVED, async ({
    to, workflowName, stepName, message, actionUrl,
  }) => {
    try {
      await NotificationService.sendWorkflowUpdate({
        to,
        subject: `Approved: ${workflowName}`,
        workflowName,
        stepName: stepName || 'Review',
        status: 'approved',
        message: message || `${workflowName} has been approved.`,
        actionUrl,
      });
    } catch (err) {
      logger.error('[NotificationBus] workflow.approved handler failed', { error: err.message });
    }
  });

  // ── workflow.rejected ────────────────────────────────────────────
  // Payload: { to, workflowName, stepName?, message?, actionUrl? }
  notificationBus.on(EVENTS.WORKFLOW_REJECTED, async ({
    to, workflowName, stepName, message, actionUrl,
  }) => {
    try {
      await NotificationService.sendWorkflowUpdate({
        to,
        subject: `Rejected: ${workflowName}`,
        workflowName,
        stepName: stepName || 'Review',
        status: 'failed',
        message: message || `${workflowName} was not approved.`,
        actionUrl,
      });
    } catch (err) {
      logger.error('[NotificationBus] workflow.rejected handler failed', { error: err.message });
    }
  });

  // ── workflow.updated ─────────────────────────────────────────────
  // Payload: { to, workflowName, stepName, status, message, actionUrl? }
  notificationBus.on(EVENTS.WORKFLOW_UPDATED, async ({
    to, workflowName, stepName, status, message, actionUrl,
  }) => {
    try {
      await NotificationService.sendWorkflowUpdate({
        to,
        subject: `Update: ${workflowName} — ${stepName}`,
        workflowName,
        stepName,
        status,
        message,
        actionUrl,
      });
    } catch (err) {
      logger.error('[NotificationBus] workflow.updated handler failed', { error: err.message });
    }
  });

  // ── request.received ─────────────────────────────────────────────
  // Payload: { to, requestType, requestTitle, requesterName, message, dueDate?, actionUrl? }
  notificationBus.on(EVENTS.REQUEST_RECEIVED, async ({
    to, requestType, requestTitle, requesterName, message, dueDate, actionUrl,
  }) => {
    try {
      await NotificationService.sendRequest({
        to,
        subject: `Action Required: ${requestTitle}`,
        requestType,
        requestTitle,
        requesterName,
        message,
        dueDate,
        actionUrl,
        actionLabel: 'Review Request',
      });
    } catch (err) {
      logger.error('[NotificationBus] request.received handler failed', { error: err.message });
    }
  });

  // ── request.completed ────────────────────────────────────────────
  // Payload: { to, requestTitle, message?, actionUrl? }
  notificationBus.on(EVENTS.REQUEST_COMPLETED, async ({
    to, requestTitle, message, actionUrl,
  }) => {
    try {
      await NotificationService.sendSystem({
        to,
        subject: `Completed: ${requestTitle}`,
        message: message || `Your request "${requestTitle}" has been completed.`,
        actionUrl,
      });
    } catch (err) {
      logger.error('[NotificationBus] request.completed handler failed', { error: err.message });
    }
  });

  // ── system.broadcast ─────────────────────────────────────────────
  // Payload: { to, subject, message, actionUrl? }
  notificationBus.on(EVENTS.SYSTEM_BROADCAST, async ({
    to, subject, message, actionUrl,
  }) => {
    try {
      await NotificationService.sendSystem({
        to, subject, message, actionUrl,
      });
    } catch (err) {
      logger.error('[NotificationBus] system.broadcast handler failed', { error: err.message });
    }
  });

  logger.info('[NotificationBus] All handlers registered', {
    eventCount: Object.keys(EVENTS).length,
  });
}

module.exports = { notificationBus, EVENTS, registerHandlers };

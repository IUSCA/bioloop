/**
 * src/notification/types.js
 *
 * All notification type constants and their Bull queue/priority routing.
 *
 * To add a new notification type:
 *   1. Add a constant to TYPES
 *   2. Add a routing entry to QUEUE_ROUTING
 *   3. Add a send method to NotificationService.js
 *   4. Add a .hbs template to templates/
 *   Nothing else needs to change.
 */

const TYPES = Object.freeze({
  ALERT: 'alert',
  WORKFLOW: 'workflow',
  REQUEST: 'request',
  DIGEST: 'digest',
  SYSTEM: 'system',
});

/**
 * Maps each notification type to:
 *   queueName — which Bull queue to enqueue to
 *   priority  — Bull job priority (1 = highest, higher number = lower priority)
 */
const QUEUE_ROUTING = Object.freeze({
  [TYPES.ALERT]: { queueName: 'email:high', priority: 1 },
  [TYPES.SYSTEM]: { queueName: 'email:high', priority: 1 },
  [TYPES.WORKFLOW]: { queueName: 'email:normal', priority: 3 },
  [TYPES.REQUEST]: { queueName: 'email:normal', priority: 3 },
  [TYPES.DIGEST]: { queueName: 'email:low', priority: 10 },
});

// Deduplicated list of all queue names — used by worker to register processors.
const QUEUE_NAMES = [...new Set(Object.values(QUEUE_ROUTING).map((r) => r.queueName))];
// Result: ['email:high', 'email:normal', 'email:low']

module.exports = { TYPES, QUEUE_ROUTING, QUEUE_NAMES };

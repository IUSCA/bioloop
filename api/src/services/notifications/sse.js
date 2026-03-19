/**
 * In-memory pub/sub for SSE notification invalidation.
 *
 * Limitation: This uses a process-local EventEmitter, so events are
 * only delivered to clients connected to the same Node instance. A
 * multi-instance deployment requires an external pub/sub adapter
 * (e.g. Redis) in place of this emitter.
 */
const { EventEmitter } = require('events');

const notificationEmitter = new EventEmitter();
notificationEmitter.setMaxListeners(0);

function userEventName(userId) {
  return `notification-user-${userId}`;
}

/**
 * Subscribes a handler to SSE events for a specific user.
 * @param {{ userId: number, handler: Function }} opts
 * @returns {Function} Unsubscribe callback
 */
function subscribeUser({ userId, handler }) {
  const eventName = userEventName(userId);
  notificationEmitter.on(eventName, handler);
  return () => {
    notificationEmitter.off(eventName, handler);
  };
}

/**
 * Emits an event to all connected SSE listeners for the given user IDs.
 * Duplicates in userIds are deduplicated before emission.
 * @param {{ userIds: number[], payload: Object }} opts
 */
function publishToUsers({ userIds = [], payload = {} }) {
  const uniqUserIds = Array.from(new Set((userIds || []).filter(Boolean)));
  if (uniqUserIds.length === 0) return;
  const eventPayload = {
    ...payload,
    timestamp: new Date().toISOString(),
  };
  uniqUserIds.forEach((userId) => {
    notificationEmitter.emit(userEventName(userId), eventPayload);
  });
}

module.exports = {
  subscribeUser,
  publishToUsers,
};

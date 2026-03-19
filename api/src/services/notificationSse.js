const { EventEmitter } = require('events');

const notificationEmitter = new EventEmitter();
notificationEmitter.setMaxListeners(0);

function userEventName(userId) {
  return `notification-user-${userId}`;
}

function subscribeUser({ userId, handler }) {
  const eventName = userEventName(userId);
  notificationEmitter.on(eventName, handler);
  return () => {
    notificationEmitter.off(eventName, handler);
  };
}

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

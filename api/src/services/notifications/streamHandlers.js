const createError = require('http-errors');
const { subscribeUser } = require('./sse');
const { isPrivilegedNotificationViewer } = require('./queryService');

/**
 * Express handler for SSE notification streams. Sends a `ready` event on connect,
 * then forwards per-user invalidation events as `notification` events.
 */
function sseStreamHandler(req, res) {
  // #swagger.tags = ['notifications']
  // #swagger.summary = Notification invalidation event stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const sendEvent = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  sendEvent('ready', {
    type: 'READY',
    timestamp: new Date().toISOString(),
  });

  const unsubscribe = subscribeUser({
    userId: req.user.id,
    handler: (payload) => sendEvent('notification', payload),
  });
  const heartbeat = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
}

function requireAdminOrOperatorNotificationStream(req, res, next) {
  if (isPrivilegedNotificationViewer(req.user)) {
    return next();
  }
  return next(createError(403));
}

module.exports = {
  sseStreamHandler,
  requireAdminOrOperatorNotificationStream,
};

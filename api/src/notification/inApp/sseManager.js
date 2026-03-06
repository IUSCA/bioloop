/**
 * src/notification/inApp/sseManager.js
 *
 * SSE MANAGER
 * ────────────
 * Manages active SSE connections and cross-process pub/sub via Redis.
 *
 * Each PM2 worker holds a Map of userId → Set<Response>.
 * When a notification is created on any worker, it is published to Redis.
 * Every worker checks if it holds a connection for that userId and pushes
 * directly to the browser if so.
 *
 * Redis pub/sub uses two dedicated ioredis connections (separate from Bull)
 * sharing the same host/port/password config.
 */

const Redis = require('ioredis');
const config = require('config');
const logger = require('@/services/logger');

const CHANNEL_PREFIX = 'sse:notify:';

function createRedisClient() {
  return new Redis({
    host: config.get('redis.host'),
    port: config.get('redis.port'),
    password: config.get('redis.password') || undefined,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
}

class SseManager {
  constructor() {
    /** @type {Map<number, Set<import('express').Response>>} */
    // Map<userId, Set<res>> is appropriate for SSE as long as we
    // reliably remove connections on close/error to prevent leaks.
    // we remove connections on 'close' event in addConnection(),
    // and also on write failure in _handleMessage().
    this._connections = new Map();

    this._publisher = createRedisClient();
    this._subscriber = createRedisClient();

    this._subscriber.on('message', (channel, message) => {
      this._handleMessage(channel, message);
    });

    // Subscribe to all per-user channels via pattern
    this._subscriber.psubscribe(`${CHANNEL_PREFIX}*`, (err) => {
      if (err) {
        logger.error('[SSE] Failed to psubscribe', { error: err.message });
        return;
      }
      logger.debug('[SSE] Subscribed to pattern', { pattern: `${CHANNEL_PREFIX}*` });
    });

    this._subscriber.on('pmessage', (_pattern, channel, message) => {
      this._handleMessage(channel, message);
    });

    logger.info('[SSE] Manager initialized');
  }

  /**
   * Register a new SSE connection for a user.
   * Sets appropriate headers and cleans up on connection close.
   *
   * @param {number} userId
   * @param {import('express').Response} res
   */
  addConnection(userId, res) {
    if (!this._connections.has(userId)) {
      this._connections.set(userId, new Set());
    }
    const connections = this._connections.get(userId);
    connections.add(res);

    // Send an initial ping so the browser knows the stream is alive
    res.write('event: ping\ndata: {}\n\n');

    res.on('close', () => {
      this._removeConnection(userId, res);
      logger.debug('[SSE] Connection removed', { userId });
    });

    res.on('error', (err) => {
      this._removeConnection(userId, res);
      logger.warn('[SSE] Connection error, removed', { userId, error: err.message });
    });

    logger.debug('[SSE] Connection added', { userId, total: connections.size });
  }

  /**
   * Push a notification to all SSE connections for a user.
   * Publishes to Redis so all PM2 workers are notified.
   *
   * @param {number} userId
   * @param {object} notification - the Prisma notification row
   */
  async push(userId, notification) {
    const channel = `${CHANNEL_PREFIX}${userId}`;
    await this._publisher.publish(channel, JSON.stringify(notification));
  }

  /**
   * Push SSE data directly to connections held by THIS worker process.
   *
   * @private
   */
  _handleMessage(channel, message) {
    const prefix = CHANNEL_PREFIX;
    if (!channel.startsWith(prefix)) return;

    const userId = parseInt(channel.slice(prefix.length), 10);
    if (Number.isNaN(userId)) return;

    const connections = this._connections.get(userId);
    if (!connections || connections.size === 0) return;

    const payload = `event: notification\ndata: ${message}\n\n`;

    for (const res of connections) {
      try {
        logger.debug('[SSE] Pushing notification to connection', { userId });
        res.write(payload);
      } catch (err) {
        logger.warn('[SSE] Write failed, removing connection', { userId, error: err.message });
        this._removeConnection(userId, res);
      }
    }
  }

  /**
   * Remove a connection from the Map, called on 'close' or write failure.
   *
   * @private
   */
  _removeConnection(userId, res) {
    const connections = this._connections.get(userId);
    if (!connections) return;
    connections.delete(res);
    if (connections.size === 0) {
      this._connections.delete(userId);
    }
  }
}

// One singleton per PM2 worker process
const sseManager = new SseManager();
module.exports = { sseManager };

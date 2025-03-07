const amqp = require('amqplib');
const config = require('config');

const logger = require('../logger');
const { eventBus } = require('./index');

const event_queue = config.get('rabbitmq.event_queue');
const password = encodeURIComponent(config.get('queue.password'));
const rabbitmq_url = `amqp://${config.get('queue.username')}:${password}@${config.get('queue.url')}`;

class EventPublisher {
  constructor(url) {
    // singleton pattern
    if (EventPublisher.instance) {
      // eslint-disable-next-line no-constructor-return
      return EventPublisher.instance; // Return the existing instance if it exists
    }
    EventPublisher.instance = this;
    this.url = url;
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createConfirmChannel();
    // Ensure the queue exists
    await this.channel.assertQueue(event_queue, { durable: true });
    logger.info('Connected to RabbitMQ and channel created');
  }

  async publish(event) {
    return new Promise((resolve, reject) => {
      const buf = Buffer.from(JSON.stringify(event));
      // channel behaves like stream.Writable, does not return a promise
      // TODO: wait for drain event if channel is busy
      this.channel.sendToQueue(event_queue, buf, {
        persistent: true,
      }, (err, ok) => {
        if (err) {
          reject(err);
        } else {
          resolve(ok);
        }
      });
    });
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (err) {
      logger.error(`Failed to close RabbitMQ connection: ${err.message}`);
    }
  }

  start() {
    return this.connect()
      .then(() => {
        // onAny is invoked synchronously when an event is emitted
        // we need to publish the event asynchronously to avoid blocking the event loop
        // so we use setImmediate to defer the publishing to the next tick
        eventBus.onAny((event, payload) => {
          if (payload == null || typeof payload !== 'object') {
            logger.warn(`Unable to publish event. Invalid payload: ${JSON.stringify(payload)}`);
            return;
          }
          setImmediate(() => {
            this.publish({ name: event, ...payload }).catch((err) => {
              logger.error(`Failed to publish event ${event}: ${err.message}`);
            });
          });
        });
      })
      .catch((err) => {
        logger.error(`Failed to connect to RabbitMQ: ${err.message}`);
      });
  }
}

const eventPublisher = new EventPublisher(rabbitmq_url);

module.exports = eventPublisher;

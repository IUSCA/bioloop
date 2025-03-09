/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
require('dotenv-safe').config();
require('../db');
const amqp = require('amqplib');
const config = require('config');
const _ = require('lodash/fp');

const notificationService = require('../services/notifications');
const { getTemplateClass } = require('../services/notifications/templates');
const logger = require('../services/logger');
const { safeParseJSON } = require('../utils');
const Event = require('../services/events/event');

const MAX_RETRIES = 5;
const WRITE_BATCH_SIZE = 1000;
const event_queue = config.get('notifications.event_queue');
const notification_queues = config.get('notifications.notification_queues');
const CHANNELS = Object.keys(notification_queues);
const password = encodeURIComponent(config.get('queue.password'));
const rabbitmq_url = `amqp://${config.get('queue.username')}:${password}@${config.get('queue.url')}`;

async function publish(confirmChannel, queue, msg) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(msg));
    confirmChannel.sendToQueue(queue, buf, {
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

// This function throwing an error will cause the event to be requeued
// When an empty array is returned, the event is acked but no notifications are sent
async function createNotifications(event) {
  // fetch users subscribed to this event - failure point
  // Can fail due to a transient issue (e.g., database down), we should not ack the message and requeue it
  // let the error propagate to the caller
  const users = await notificationService.getUsersSubscribedToEvent({
    event_name: event.name,
    resource_id: event.data?.resource_id,
    resource_type: event.data?.resource_type,
  });
  logger.info(`Found ${users.length} users subscribed to event: ${event.name}`);

  // if there are no users, Acknowledge (ack) the message immediately since no further processing is required.
  if (users.length === 0) {
    return [];
  }

  const TemplateClass = getTemplateClass(event.name);
  if (!TemplateClass) {
    // acknowledge (ack) the message, as retrying won’t change the missing template situation.
    logger.warn(`No template class found for the event: ${event.name}`);
    return [];
  }

  // "build the template" - get necessary data for constructing the message - failure point
  let templateInstance;
  try {
    templateInstance = await (new TemplateClass(event)).build();
  } catch (error) {
    if (error.name === 'NonRetryableError') {
      // This is an unrecoverable error (bad data). The message should be acknowledged and logged,
      // as retrying will not fix the issue.
      logger.error('Error building template:', error);
      return [];
    }
    // This is a transient error (e.g., database down). We should not ack the message and requeue it
    // let the error propagate to the caller
    throw error;
  }

  const notifications = CHANNELS
    .flatMap((channel) => users.map(
      (user) => ({
        event_id: event.id,
        id: `${user.id}-${channel}`,
        message: templateInstance.getMessage(user, channel),
        delivery_details: notificationService.getDeliveryDetails(user, channel),
        channel,
      }),
    ))
    .filter((item) => item.message);
  return notifications;
}

async function cleanup(connection, channels) {
  if (channels) {
    await Promise.allSettled(channels.map((channel) => channel.close()));
  }

  if (connection) {
    await connection.close();
  }
  logger.info('Connection closed');
}

async function run() {
  let connection;
  let readChannel;
  let writeChannel;
  try {
  // Connect to RabbitMQ server
    connection = await amqp.connect(rabbitmq_url);
    readChannel = await connection.createChannel();
    writeChannel = await connection.createConfirmChannel();

    // Ensure the queue exists
    await readChannel.assertQueue(event_queue, { durable: true });

    // Ensure the notifications queue exists
    await Promise.all(
      Object.values(notification_queues)
        .map((nq) => writeChannel.assertQueue(nq, { durable: true })),
    );

    logger.info(`[*] Waiting for messages in ${event_queue}. To exit, press CTRL+C`);

    // Consume messages
    readChannel.consume(event_queue, async (msg) => {
      const event = Event.fromJSON(safeParseJSON(msg.content.toString()));
      if (event) { // valid event
        // console.log('Received event:', JSON.stringify(event.toJSON(), null, 2));
        try {
          const notifications = await createNotifications(event);
          logger.info(`Created ${notifications.length} notification msgs for event: ${event.name}`);

          // process in batches to avoid memory exhaustion / stack overflow
          // do not requeue the message if this fails
          let num_failed = 0;
          for (const batch of _.chunk(WRITE_BATCH_SIZE, notifications)) {
            const result = await Promise.allSettled(
              batch.map((out_msg) => publish(writeChannel, notification_queues[out_msg.channel], out_msg)),
            );
            num_failed += result.filter((r) => r.status === 'rejected').length;
          }
          logger.info(
            `Sent ${notifications.length - num_failed}/${notifications.length} messages to notification queues`,
          );

          // delete one time subscriptions
          // catch errors but do not requeue the message
          // we don't want to retry the message if this fails
          await notificationService.deleteEventSubscriptions({
            event_name: event.name,
            resource_id: event.data?.resource_id,
            resource_type: event.data?.resource_type,
          }).catch((err) => {
            logger.error('Error deleting event subscriptions', err);
          });

          readChannel.ack(msg, false); // Acknowledge message
        } catch (error) {
          logger.error('Error processing event', error);
          const retryCount = msg.properties.headers['x-retry-count'] || 0;

          if (retryCount >= MAX_RETRIES) {
            logger.warn(`Message ${msg.fields.deliveryTag} discarded after ${MAX_RETRIES} attempts`);
            readChannel.nack(msg, false, false); // discard message
          } else {
            readChannel.sendToQueue(event_queue, msg.content, {
              headers: { 'x-retry-count': retryCount + 1 },
            });
            readChannel.ack(msg);
          }
        }
      } else {
        readChannel.ack(msg, false); // Acknowledge message
      }
    }, { noAck: false });

    // Handle SIGINT (CTRL+C) and SIGTERM (kill command)
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, closing connection...`);
      await cleanup(connection, [readChannel, writeChannel]);
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.error('Error in notification processor:', error);
    await cleanup(connection, [readChannel, writeChannel]);
    process.exit(1);
  }
}

run();

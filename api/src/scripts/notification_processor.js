const amqp = require('amqplib');
const config = require('config');

const notificationService = require('../services/notifications');
const { getTemplateClass } = require('../services/notifications/templates');
const logger = require('../services/logger');

const event_queue = config.get('rabbitmq.event_queue');
const notification_queues = config.get('rabbitmq.notification_queues');
// eslint-disable-next-line max-len

const password = encodeURIComponent(config.get('queue.password'));
const rabbitmq_url = `amqp://${config.get('queue.username')}:${password}@${config.get('queue.url')}`;

async function processMessage(msg) {
  // convert to json
  // {"name": "dataset.staged", "resource_id": "123", "resource_type": "dataset"}
  // failure point
  const event = JSON.parse(msg);

  // fetch users subscribed to this event - failure point
  const users = await notificationService.getUsersSubscribedToEvent({
    event_name: event.name,
    resource_id: event.resource_id,
    resource_type: event.resource_type,
  });

  // if there are no users, return
  if (users.length === 0) {
    return [];
  }

  const TemplateClass = getTemplateClass(event.name);
  if (!TemplateClass) {
    logger.warn(`No template class found for the event: ${event.name}`);
    return [];
  }

  // todo: handle errors in building the template - failure point
  const templateInstance = await (new TemplateClass(event)).build();

  const channels = ['email', 'app'];
  const notifications = channels
    .flatMap((channel) => users.map(
      (user) => ({
        message: templateInstance.getMessage(user, channel),
        deliveryDetails: notificationService.getDeliveryDetails(user, channel),
        channel,
      }),
    ))
    .filter((item) => item.message);
  return notifications;
}

async function run() {
  // Connect to RabbitMQ server
  const connection = await amqp.connect(rabbitmq_url);
  const readChannel = await connection.createChannel();
  const writeChannel = await connection.createChannel();

  // Ensure the queue exists
  await readChannel.assertQueue(event_queue, { durable: true });

  // Ensure the notifications queue exists
  await Promise.all(
    Object.values(notification_queues)
      .map((nq) => writeChannel.assertQueue(nq, { durable: true })),
  );

  logger.log(`[*] Waiting for messages in ${event_queue}. To exit, press CTRL+C`);

  // Consume messages
  readChannel.consume(event_queue, async (msg) => {
    if (msg !== null) {
      const msg_str = msg.content.toString();
      // console.log(`[x] Received: ${msg_str}`);
      try {
        const notifications = await processMessage(msg_str);
        const promises = notifications.map((out_msg) => {
          const buf = Buffer.from(JSON.stringify(out_msg));
          const nq = notification_queues[out_msg.channel];
          if (!nq) {
            logger.warn(`No queue found for channel: ${out_msg.channel}`);
            return Promise.resolve();
          }
          return writeChannel.sendToQueue(nq, buf, {
            persistent: true,
          });
        });
        await Promise.allSettled(promises);
        readChannel.ack(msg); // Acknowledge message after processing
      } catch (error) {
        logger.error('Error processing event:', error);
        readChannel.nack(msg, false, true); // Requeue the event - TODO: should I?
      }
    }
  }, { noAck: false });
}

run();

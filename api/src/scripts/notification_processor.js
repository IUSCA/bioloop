const amqp = require('amqplib');
const config = require('config');

const notificationService = require('../services/notifications');
const { getTemplateClass } = require('../services/notifications/templates');
const logger = require('../services/logger');

const url = config.get('rabbitmq.url');
const event_queue = config.get('rabbitmq.event_queue');
const notifications_queue = config.get('rabbitmq.notifications_queue');

async function processMessage(msg) {
  // convert to json
  // {"name": "dataset.staged", "resource_id": "123", "resource_type": "dataset"}
  const event = JSON.parse(msg);

  // fetch users subscribed to this event
  const users = await notificationService.getUsersSubscribedToEvent({
    event_name: event.name,
    resource_id: event.resource_id,
    resource_type: event.resource_type,
  });

  // if there are no users, return
  if (users.length === 0) {
    return;
  }

  const TemplateClass = getTemplateClass(event.name);
  if (!TemplateClass) {
    logger.warn(`No template class found for the event: ${event.name}`);
    return;
  }

  // todo: handle errors in building the template
  const templateInstance = await (new TemplateClass(event)).build();

  const channel = 'email';
  const notifications = users.map((user) => ({
    message: templateInstance.getMessage(user, channel),
    deliveryDetails: notificationService.getDeliveryDetails(user, channel),
    channel,
  }));
  return notifications;

  // await Promise.allSettled(notifications.map(publishToNotificationQueue));

  // find unique notification channels
  // const channels = users.reduce((acc, user) => acc.union(
  //   new Set(user.notification_preferences.map((pref) => pref.name)),
  // ), new Set());

  // for each channel, create a message
  // const messages = {};
  // channels.forEach(async (channel) => {
  // const channelMsg = await notificationService.createMessage(event,
  // channel); if (channelMsg) { messages[channel] = channelMsg; } });

  // for each user, for each channel, send a message to the notification queue
  // if the channel is not in the messages object, skip
  // const notifications = users.flatMap((user) =>
  // user.notification_preferences.map((pref) => ({ deliveryDetails:
  // getDerliveryDetails(user, pref), channel: pref.name, message:
  // messages[pref.name], }))) .filter((item) => item.message);
}

async function run() {
  try {
    // Connect to RabbitMQ server
    const connection = await amqp.connect(url);
    const readChannel = await connection.createChannel();
    const writeChannel = await connection.createChannel();

    // Ensure the queue exists
    await readChannel.assertQueue(event_queue, { durable: true });
    await writeChannel.assertQueue(notifications_queue, { durable: true });

    logger.log(`[*] Waiting for messages in ${event_queue}. To exit, press CTRL+C`);

    // Consume messages
    readChannel.consume(event_queue, async (msg) => {
      if (msg !== null) {
        const msg_str = msg.content.toString();
        // console.log(`[x] Received: ${msg_str}`);
        const notifications = await processMessage(msg_str);

        const promises = notifications.map((out_msg) => {
          const buf = Buffer.from(JSON.stringify(out_msg));
          return writeChannel.sendToQueue(notifications_queue, buf, {
            persistent: true,
          });
        });
        await Promise.allSettled(promises);

        // Acknowledge message after processing
        readChannel.ack(msg);
      }
    }, { noAck: false });
  } catch (error) {
    logger.error('Error:', error);
  }
}

run();

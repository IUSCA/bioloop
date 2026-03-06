const nodemailer = require('nodemailer');
const config = require('config');

const logger = require('@/services/logger');
// cSpell: ignore Mailgun
/**
 * TRANSPORT LAYER
 * ───────────────
 * Currently configured for Postfix SMTP relay on the host machine.
 * The container connects to host.docker.internal:25 which Postfix
 * trusts and relays through the university's mail infrastructure.
 *
 * MIGRATING TO ANOTHER PROVIDER (e.g. AWS SES, Mailgun):
 *   1. Update SMTP_HOST / SMTP_PORT / add SMTP_USER / SMTP_PASS in .env
 *   2. Optionally switch createTransport() to a provider-specific factory:
 *      nodemailer.createTransport(require('nodemailer-mailgun-transport')(opts))
 *   3. No changes needed anywhere else in the codebase.
 */

let _transporter = null;

function createTransporter() {
  const transportOptions = {
    host: config.get('smtp.host'),
    port: config.get('smtp.port'),
    secure: config.get('smtp.secure'),
    // Postfix relay: no auth needed from trusted docker network
    // If migrating to authenticated SMTP, uncomment:
    // auth: {
    //   user: config.get('smtp.auth.user'),
    //   pass: config.get('smtp.auth.pass'),
    // },
    pool: true, // reuse connections
    maxConnections: 5, // match queue concurrency
    maxMessages: 100, // per connection before recycling
    rateDelta: 1000, // throttle window (ms)
    rateLimit: 10, // max sends per rateDelta
    logger: false,
    debug: false,
  };

  const transporter = nodemailer.createTransport(transportOptions);

  transporter.on('error', (err) => {
    logger.error('SMTP transport error', { error: err.message });
  });

  return transporter;
}

/**
 * Returns the singleton transporter (lazy init).
 */
function getTransporter() {
  if (!_transporter) {
    _transporter = createTransporter();
    logger.info('SMTP transporter created', {
      host: config.get('smtp.host'),
      port: config.get('smtp.port'),
    });
  }
  return _transporter;
}

/**
 * Verify SMTP connection. Called at startup.
 * @returns {Promise<boolean>}
 */
async function verifyConnection() {
  try {
    await getTransporter().verify();
    logger.info('SMTP connection verified ✓');
    return true;
  } catch (err) {
    logger.warn('SMTP connection verification failed — emails will queue', {
      error: err.message,
    });
    return false;
  }
}

/**
 * Send an email message.
 * @param {object} mailOptions - nodemailer mail options
 * @returns {Promise<object>} nodemailer info object
 */
async function sendMail(mailOptions) {
  const from = `"${config.get('smtp.from.name')}" <${config.get('smtp.from.address')}>`;

  const message = {
    from,
    ...mailOptions,
  };

  const info = await getTransporter().sendMail(message);

  logger.info('Email sent', {
    messageId: info.messageId,
    to: Array.isArray(message.to) ? message.to : [message.to],
    subject: message.subject,
  });

  return info;
}

module.exports = { sendMail, verifyConnection };

/* eslint-disable no-console */
require('module-alias/register');

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');

require('dotenv-safe').config({ example: '.env.default' });

const config = require('config');
const notify = require('@/notification/NotificationService');
const { closeAllQueues } = require('@/notification/queue/queues');
const alertFixtures = require('../notification/email-preview/fixtures/alert.json');
const workflowFixtures = require('../notification/email-preview/fixtures/workflow.json');
const requestFixtures = require('../notification/email-preview/fixtures/request.json');
const digestFixtures = require('../notification/email-preview/fixtures/digest.json');
const systemFixtures = require('../notification/email-preview/fixtures/system.json');

const fixtures = {
  alert: alertFixtures,
  workflow: workflowFixtures,
  request: requestFixtures,
  digest: digestFixtures,
  system: systemFixtures,
};

let shouldCloseQueues = false;

const senders = {
  alert: (to, fixture, userId) => notify.sendAlert({
    to,
    userId,
    subject: fixture.subject,
    alertTitle: fixture.alertTitle,
    alertBody: fixture.alertBody,
    severity: fixture.severity,
    actionUrl: fixture.actionUrl,
    actionLabel: fixture.actionLabel,
  }),
  workflow: (to, fixture, userId) => notify.sendWorkflowUpdate({
    to,
    userId,
    subject: fixture.subject,
    workflowName: fixture.workflowName,
    stepName: fixture.stepName,
    status: fixture.status,
    message: fixture.message,
    actionUrl: fixture.actionUrl,
    actionLabel: fixture.actionLabel,
  }),
  request: (to, fixture, userId) => notify.sendRequest({
    to,
    userId,
    subject: fixture.subject,
    requestType: fixture.requestType,
    requestTitle: fixture.requestTitle,
    requesterName: fixture.requesterName,
    message: fixture.message,
    dueDate: fixture.dueDate,
    actionUrl: fixture.actionUrl,
    actionLabel: fixture.actionLabel,
  }),
  digest: (to, fixture) => notify.sendDigest({
    to,
    subject: fixture.subject,
    period: fixture.period,
    items: fixture.items,
  }),
  system: (to, fixture, userId) => notify.sendSystem({
    to,
    userId,
    subject: fixture.subject,
    message: fixture.message,
    actionUrl: fixture.actionUrl,
    actionLabel: fixture.actionLabel,
  }),
};

function usage() {
  const eventTypes = Object.keys(senders).join('|');

  console.error(`Usage:
  node src/scripts/send_dummy_notification.js <${eventTypes}> [to[,to2]] [fixture|userId] [userId]

Examples:
  node src/scripts/send_dummy_notification.js alert user@example.edu
  node src/scripts/send_dummy_notification.js alert user@example.edu 42
  node src/scripts/send_dummy_notification.js system maintenance 42
  node src/scripts/send_dummy_notification.js digest default
  npm run notify:dummy -- workflow user@example.edu default 42`);
}

function parseRecipients(value) {
  return value
    .split(',')
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function getFixture(eventType, fixtureName) {
  const fixtureGroup = fixtures[eventType];

  if (!fixtureGroup) {
    throw new Error(`Unknown event type "${eventType}". Expected one of: ${Object.keys(senders).join(', ')}`);
  }

  const availableFixtures = Object.keys(fixtureGroup);
  const resolvedFixtureName = fixtureName || (fixtureGroup.default ? 'default' : availableFixtures[0]);
  const fixture = fixtureGroup[resolvedFixtureName];

  if (!fixture) {
    const availableFixtureNames = availableFixtures.join(', ');
    throw new Error(
      `Unknown fixture "${resolvedFixtureName}" for "${eventType}". Available fixtures: ${availableFixtureNames}`,
    );
  }

  return { fixture, fixtureName: resolvedFixtureName };
}

function requiresRecipient(eventType) {
  return ['alert', 'workflow', 'request'].includes(eventType);
}

async function main(argv) {
  const [eventType, rawArg2, rawArg3, rawArg4] = argv;

  if (eventType === '--help' || eventType === '-h' || !eventType) {
    usage();
    process.exitCode = eventType ? 0 : 1;
    return;
  }

  if (config.get('env') === 'production') {
    throw new Error('Refusing to send dummy notifications while running with production config.');
  }

  // Determine if arg2 is a recipient email or a fixture name
  const isRecipientEmail = rawArg2 && (rawArg2.includes('@') || requiresRecipient(eventType));
  const rawRecipients = isRecipientEmail ? rawArg2 : null;
  const rawFixtureOrUserId = isRecipientEmail ? rawArg3 : rawArg2;
  const rawExplicitUserId = isRecipientEmail ? rawArg4 : rawArg3;

  const isUserIdShortcut = rawExplicitUserId == null && /^\d+$/.test(rawFixtureOrUserId || '');
  const rawFixtureName = isUserIdShortcut ? undefined : rawFixtureOrUserId;
  const rawUserId = isUserIdShortcut ? rawFixtureOrUserId : rawExplicitUserId;

  const to = rawRecipients ? parseRecipients(rawRecipients) : [];

  if (requiresRecipient(eventType) && to.length === 0) {
    throw new Error(`Notification type "${eventType}" requires at least one recipient email address.`);
  }

  const userId = rawUserId == null ? undefined : Number(rawUserId);
  if (rawUserId != null && !Number.isInteger(userId)) {
    throw new Error(`userId must be an integer when provided. Received "${rawUserId}".`);
  }

  if (eventType === 'digest' && rawUserId != null) {
    throw new Error('Digest notifications do not currently support in-app userId writes.');
  }

  const { fixture, fixtureName } = getFixture(eventType, rawFixtureName);
  shouldCloseQueues = true;
  const job = await senders[eventType](to.length > 0 ? to : undefined, fixture, userId);

  console.log(JSON.stringify({
    queued: true,
    eventType,
    fixture: fixtureName,
    recipients: to.length > 0 ? to : null,
    userId: userId ?? null,
    jobId: job.id,
    queue: job.queue.name,
  }, null, 2));
}

main(process.argv.slice(2))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (shouldCloseQueues) {
      await closeAllQueues();
    }
  });

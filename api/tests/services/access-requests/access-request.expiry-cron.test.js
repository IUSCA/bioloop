/**
 * access-request.expiry-cron.test.js
 *
 * `expireStaleRequests` was implemented, tested, and called by nothing, so a request sat
 * UNDER_REVIEW forever and the pending queue only ever grew. This asserts the cron module
 * registers the job and that the handler it registers actually expires a stale request.
 *
 * @see docs/design/groups/access-requests-plan.md — D2
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const config = require('config');
const cron = require('node-cron');
const prisma = require('@/db');
// Submitting writes an in-app notification, which pulls in the SSE manager's two long-lived
// Redis connections. Without closing them the process never exits.
const { sseManager } = require('@/notification/inApp/sseManager');
const arService = require('@/services/access_requests');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  getAccessTypeId,
  deleteAccessRequests,
  deleteUser,
  deleteGroup,
  deleteDataset,
} = require('../helpers');

let requester;
let ownerGroup;
let dataset;
let viewMetadataTypeId;

const userIds = [];
const groupIds = [];
const datasetIds = [];

beforeAll(async () => {
  requester = await createTestUser('_arx_req');
  userIds.push(requester.id);

  ownerGroup = await createTestGroup(requester.subject_id, '_arx_og');
  groupIds.push(ownerGroup.id);

  dataset = await createTestDataset(ownerGroup.id, '_arx_ds');
  datasetIds.push(dataset.id);

  viewMetadataTypeId = await getAccessTypeId('DATASET:VIEW_METADATA');
}, 30_000);

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { user_id: { in: userIds } } });
  await deleteAccessRequests({ requesterIds: [requester.subject_id] });
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await sseManager.shutdown();
  await prisma.$disconnect();
}, 30_000);

describe('the expiry job is scheduled', () => {
  test('cron.js registers a job for the configured schedule', () => {
    const scheduled = [];
    const original = cron.schedule;
    cron.schedule = (expression, handler, options) => {
      scheduled.push({ expression, handler, options });
      return { stop() {} };
    };

    try {
      // eslint-disable-next-line global-require
      require('@/notification/cron')();
    } finally {
      cron.schedule = original;
    }

    const expected = config.get('notify.cron.access_request_expiry.schedule');
    const job = scheduled.find((s) => s.expression === expected);

    expect(job).toBeDefined();
    expect(job.options.timezone).toBe(config.get('notify.cron.timezone'));
    // Every job registered here shares the one configured timezone, so none is left on the
    // template's Europe/London.
    for (const s of scheduled) {
      expect(s.options.timezone).toBe(config.get('notify.cron.timezone'));
    }
  });

  test('the configured age expires a request that has sat unreviewed', async () => {
    const created = await arService.createAndSubmitAccessRequest({
      type: 'NEW',
      resource_id: dataset.resource_id,
      subject_id: requester.subject_id,
      purpose: 'expiry test',
      items: [{ access_type_id: viewMetadataTypeId }],
    }, requester.subject_id);

    const maxAgeDays = config.get('notify.cron.access_request_expiry.max_age_days');
    const submittedAt = new Date();
    submittedAt.setDate(submittedAt.getDate() - (maxAgeDays + 1));
    await prisma.access_request.update({
      where: { id: created.id },
      data: { submitted_at: submittedAt },
    });

    const count = await arService.expireStaleRequests({ max_age_days: maxAgeDays });
    expect(count).toBeGreaterThanOrEqual(1);

    const after = await prisma.access_request.findUnique({ where: { id: created.id } });
    expect(after.status).toBe('EXPIRED');
    expect(after.closed_at).not.toBeNull();
  }, 30_000);
});

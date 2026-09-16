/**
 * mayFileRequest.test.js
 *
 * Whether a detail page offers Request Access: the caller must be signed in, and the request's
 * own `create` state rule must admit a request on the resource. The route has already decided
 * that the caller can view the resource, so these cases vary only what this function asks.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { sseManager } = require('@/notification/inApp/sseManager');
const arService = require('@/services/access_requests');
const groupsService = require('@/services/groups');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
  deleteDataset,
} = require('../helpers');

let caller;
let openGroup;
let archivedGroup;
let openDataset;
let archivedDataset;

beforeAll(async () => {
  caller = await createTestUser('_mfr_caller');
  openGroup = await createTestGroup(caller.subject_id, '_mfr_open');
  archivedGroup = await createTestGroup(caller.subject_id, '_mfr_archived');
  await prisma.group_user.create({
    data: { group_id: archivedGroup.id, user_id: caller.subject_id, role: 'ADMIN' },
  });
  openDataset = await createTestDataset(openGroup.id, '_mfr_open_ds');
  archivedDataset = await createTestDataset(archivedGroup.id, '_mfr_archived_ds');
  await groupsService.archiveGroup(archivedGroup.id, caller.subject_id);
}, 60_000);

afterAll(async () => {
  await groupsService.unarchiveGroup(archivedGroup.id, caller.subject_id).catch(() => {});
  await deleteDataset(openDataset.id).catch(() => {});
  await deleteDataset(archivedDataset.id).catch(() => {});
  await deleteGroup(openGroup.id).catch(() => {});
  await deleteGroup(archivedGroup.id).catch(() => {});
  await deleteUser(caller.id).catch(() => {});
  await sseManager.shutdown();
  await prisma.$disconnect();
}, 60_000);

test('a signed-in caller may file on a resource whose state admits a request', async () => {
  expect(await arService.mayFileRequest({ user: caller, resource_id: openDataset.resource_id })).toBe(true);
});

test('a resource an archived group owns is not offered, because filing would be refused', async () => {
  expect(await arService.mayFileRequest({ user: caller, resource_id: archivedDataset.resource_id })).toBe(false);
});

test('nobody signed in, and the anonymous principal, are never offered a request', async () => {
  expect(await arService.mayFileRequest({ user: undefined, resource_id: openDataset.resource_id })).toBe(false);
  expect(await arService.mayFileRequest({
    user: { ...caller, is_anonymous: true }, resource_id: openDataset.resource_id,
  })).toBe(false);
});

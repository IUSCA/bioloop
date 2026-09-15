/**
 * restrictionTargets.test.js
 *
 * The restriction check must find what it is checking. It used to return "nothing blocks"
 * whenever a grant or an access request reached it without a pre-fetched resource, and
 * whenever a create action carried no resource id. Five mutating routes had that shape, so a
 * reviewer could approve a request on an archived collection and write grants on it.
 *
 * Each case here names a route shape that failed open.
 *
 * @see docs/design/groups/access-model-verification-plan.md — The restriction check refuses when it cannot find a target
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const { randomUUID } = require('crypto');

const prisma = require('@/db');
const { sseManager } = require('@/notification/inApp/sseManager');
const { authorizeAction } = require('@/authorization');
const {
  checkRestriction, RestrictionTargetError,
} = require('@/authorization/builtin/restrictions');
const groupsService = require('@/services/groups');
const collectionsService = require('@/services/collections');
const arService = require('@/services/access_requests');
const {
  createTestUser, createTestGroup, createTestChildGroup, createTestCollection,
  createTestGrant, getAccessTypeId, deleteUser, deleteGroup, deleteCollection,
} = require('../helpers');

let admin;
let requester;
let group;
let collection;
let request;
let grant;
let archivedParent;
let childOfArchived;

const groupIds = [];

beforeAll(async () => {
  admin = await createTestUser('_rt_admin');
  requester = await createTestUser('_rt_req');

  group = await createTestGroup(admin.subject_id, '_rt_group');
  groupIds.push(group.id);
  await prisma.group_user.create({
    data: { group_id: group.id, user_id: admin.subject_id, role: 'ADMIN' },
  });

  collection = await createTestCollection(group.id, admin.subject_id, '_rt_coll');
  const viewType = await getAccessTypeId('COLLECTION:VIEW_METADATA');

  request = await arService.createAccessRequest({
    type: 'NEW',
    resource_id: collection.id,
    subject_id: requester.subject_id,
    items: [{ access_type_id: viewType }],
  }, requester.subject_id);

  grant = await createTestGrant({
    subject_id: requester.subject_id,
    resource_id: collection.id,
    access_type_id: viewType,
    granted_by: admin.subject_id,
  });

  await collectionsService.archiveCollection(collection.id, admin.subject_id);

  archivedParent = await createTestGroup(admin.subject_id, '_rt_parent');
  childOfArchived = await createTestChildGroup(archivedParent.id, admin.subject_id, '_rt_child');
  groupIds.push(childOfArchived.id, archivedParent.id);
  await groupsService.archiveGroup(archivedParent.id, admin.subject_id);
}, 30_000);

afterAll(async () => {
  await prisma.access_request.deleteMany({ where: { id: request?.id } }).catch(() => {});
  await prisma.grant.deleteMany({ where: { resource_id: collection?.id } }).catch(() => {});
  if (collection) await deleteCollection(collection.id).catch(() => {});
  for (const id of groupIds) {
    // eslint-disable-next-line no-await-in-loop
    await deleteGroup(id).catch(() => {});
  }
  await deleteUser(admin.id).catch(() => {});
  await deleteUser(requester.id).catch(() => {});
  await sseManager.shutdown();
  await prisma.$disconnect();
}, 30_000);

describe('a grant or an access request addressed by id alone', () => {
  // POST /access-requests/:id/review passed no pre-fetched resource.
  test('reviewing a request on an archived collection is blocked', async () => {
    const decision = await authorizeAction('access_request', 'review', {
      identifiers: { user: admin.subject_id, resource: request.id },
    });
    expect([decision.granted, decision.blockedBy]).toEqual([false, 'ARCHIVED']);
  });

  // PUT /access-requests/:id, POST /:id/submit, and POST /:id/withdraw bind `update`.
  test('updating a request on an archived collection is blocked', async () => {
    const decision = await authorizeAction('access_request', 'update', {
      identifiers: { user: requester.subject_id, resource: request.id },
    });
    expect([decision.granted, decision.blockedBy]).toEqual([false, 'ARCHIVED']);
  });

  // POST /grants/:id/revoke passed no pre-fetched resource.
  test('revoking a grant on an archived collection is blocked', async () => {
    const decision = await authorizeAction('grant', 'revoke', {
      identifiers: { user: admin.subject_id, resource: grant.id },
    });
    expect([decision.granted, decision.blockedBy]).toEqual([false, 'ARCHIVED']);
  });

  test('an id that names no row has nothing to restrict', async () => {
    await expect(checkRestriction({
      resourceType: 'grant', action: 'revoke', resourceId: randomUUID(),
    })).resolves.toBeNull();
  });
});

describe('a call that carries nothing to resolve', () => {
  test('a mutating action raises and names the action', async () => {
    await expect(checkRestriction({ resourceType: 'grant', action: 'revoke', resourceId: null }))
      .rejects.toThrow(RestrictionTargetError);
    await expect(checkRestriction({ resourceType: 'dataset', action: 'create', resourceId: null }))
      .rejects.toThrow('dataset.create');
  });

  test('a reading action is never checked, so it does not raise', async () => {
    await expect(checkRestriction({ resourceType: 'grant', action: 'read', resourceId: null }))
      .resolves.toBeNull();
  });

  test('creating a root group has no target and is not blocked', async () => {
    await expect(checkRestriction({ resourceType: 'group', action: 'create', resourceId: null }))
      .resolves.toBeNull();
  });
});

describe('create actions resolve to the owning group', () => {
  // POST /v2/datasets, POST /v2/datasets/bulk, and POST /collections authorized with a null
  // resource id, so an archived owner or an archived ancestor blocked nothing.
  test.each([
    ['dataset', 'create'],
    ['collection', 'create'],
  ])('%s.%s under a child of an archived group is blocked', async (resourceType, action) => {
    const blockedBy = await checkRestriction({
      resourceType,
      action,
      resourceId: null,
      preFetchedResource: { owner_group_id: childOfArchived.id },
    });
    expect([`${resourceType}.${action}`, blockedBy]).toEqual([`${resourceType}.${action}`, 'ARCHIVED']);
  });

  test('a create under an active group is not blocked', async () => {
    await expect(checkRestriction({
      resourceType: 'dataset',
      action: 'create',
      resourceId: null,
      preFetchedResource: { owner_group_id: group.id },
    })).resolves.toBeNull();
  });
});

const path = require('path');

// Bootstrap aliases and basedir exactly as the application does at startup.
// Must happen before any @/ import.
global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const collectionsService = require('@/services/collections');

// ─────────────────────────────────────────────
// User
// ─────────────────────────────────────────────

/**
 * Create a minimal user row directly via Prisma.
 * Returns the created user record.
 * @param {string} [tag] - Optional suffix to ensure uniqueness across concurrent suites.
 */
async function createTestUser(tag = '') {
  const suffix = `${Date.now()}${tag}`;
  return prisma.user.create({
    data: {
      name: `Test User ${suffix}`,
      username: `testuser_${suffix}`,
      email: `testuser_${suffix}@test.invalid`,
      is_deleted: false,
    },
  });
}

// ─────────────────────────────────────────────
// Group
// ─────────────────────────────────────────────

/**
 * Create a top-level group via the groups service.
 * @param {number} actorId
 * @param {string} [tag]
 * @param {Object} [overrides] - Merged into the default data payload.
 */
async function createTestGroup(actorId, tag = '', overrides = {}) {
  const suffix = `${Date.now()}${tag}`;
  return groupsService.createGroup(
    {
      name: `Test Group ${suffix}`,
      description: 'Created by test helper',
      allow_user_contributions: false,
      ...overrides,
    },
    actorId,
  );
}

/**
 * Create a child group under an existing parent via the groups service.
 * @param {string} parentId
 * @param {number} actorId
 * @param {string} [tag]
 * @param {Object} [overrides]
 */
async function createTestChildGroup(parentId, actorId, tag = '', overrides = {}) {
  const suffix = `${Date.now()}${tag}`;
  return groupsService.createChildGroup(
    parentId,
    {
      name: `Test Child Group ${suffix}`,
      description: 'Created by test helper',
      allow_user_contributions: false,
      ...overrides,
    },
    actorId,
  );
}

// ─────────────────────────────────────────────
// Dataset
// ─────────────────────────────────────────────

/**
 * Create a minimal dataset row directly via Prisma.
 * @param {string} ownerGroupId
 * @param {string} [tag]
 * @param {Object} [overrides]
 */
async function createTestDataset(ownerGroupId, tag = '', overrides = {}) {
  const suffix = `${Date.now()}${tag}`;
  return prisma.dataset.create({
    data: {
      name: `Test Dataset ${suffix}`,
      type: 'RAW_DATA',
      owner_group_id: ownerGroupId,
      is_deleted: false,
      ...overrides,
    },
  });
}

// ─────────────────────────────────────────────
// Collection
// ─────────────────────────────────────────────

/**
 * Create a collection via the collections service.
 * @param {string} ownerGroupId
 * @param {number} actorId
 * @param {string} [tag]
 * @param {Object} [overrides]
 */
async function createTestCollection(ownerGroupId, actorId, tag = '', overrides = {}) {
  const suffix = `${Date.now()}${tag}`;
  return collectionsService.createCollection(
    {
      name: `Test Collection ${suffix}`,
      owner_group_id: ownerGroupId,
      description: 'Created by test helper',
      ...overrides,
    },
    { actor_id: actorId },
  );
}

// ─────────────────────────────────────────────
// Access type lookup
// ─────────────────────────────────────────────

/**
 * Look up the integer id of a grant_access_type by name and resource_type.
 * Throws if not found (seeded data must already exist).
 * @param {string} name - e.g. 'VIEW_METADATA'
 * @param {'DATASET'|'COLLECTION'} resourceType
 */
async function getAccessTypeId(name, resourceType) {
  const row = await prisma.grant_access_type.findFirstOrThrow({
    where: { name, resource_type: resourceType },
    select: { id: true },
  });
  return row.id;
}

// ─────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────

/**
 * Delete access requests (items cascade) for any of the given requester IDs or request IDs.
 */
async function deleteAccessRequests({ requesterIds = [], requestIds = [] } = {}) {
  if (requestIds.length) {
    await prisma.access_request_item.deleteMany({ where: { access_request_id: { in: requestIds } } });
    await prisma.access_request.deleteMany({ where: { id: { in: requestIds } } });
  }
  if (requesterIds.length) {
    const requests = await prisma.access_request.findMany({
      where: { requester_id: { in: requesterIds } },
      select: { id: true },
    });
    const ids = requests.map((r) => r.id);
    if (ids.length) {
      await prisma.access_request_item.deleteMany({ where: { access_request_id: { in: ids } } });
      await prisma.access_request.deleteMany({ where: { id: { in: ids } } });
    }
  }
}

/**
 * Delete grant rows (and their audit records) by grant IDs.
 */
async function deleteGrants(grantIds = []) {
  if (!grantIds.length) return;
  await prisma.authorization_audit.deleteMany({
    where: { target_type: 'grant', target_id: { in: grantIds } },
  });
  await prisma.grant.deleteMany({ where: { id: { in: grantIds } } });
}

/**
 * Delete all grants associated with a resource.
 */
async function deleteGrantsForResource(resourceType, resourceId) {
  const grants = await prisma.grant.findMany({
    where: { resource_type: resourceType, resource_id: resourceId },
    select: { id: true },
  });
  await deleteGrants(grants.map((g) => g.id));
}

/**
 * Delete a dataset by id (deletes associated grants first).
 */
async function deleteDataset(datasetId) {
  await deleteGrantsForResource('DATASET', datasetId);
  await prisma.dataset_file.deleteMany({ where: { dataset_id: datasetId } });
  await prisma.dataset.delete({ where: { id: datasetId } });
}

/**
 * Delete a collection by id (deletes dataset links and grants first).
 */
async function deleteCollection(collectionId) {
  await deleteGrantsForResource('COLLECTION', collectionId);
  await prisma.collection_dataset.deleteMany({ where: { collection_id: collectionId } });
  // use deleteMany to avoid throwing if already deleted
  await prisma.collection.deleteMany({ where: { id: collectionId } });
}

/**
 * Delete a group by id.
 * Cascades on group_closure and group_user in the DB schema, but audit records must be
 * removed manually as there is no FK cascade on authorization_audit.
 */
async function deleteGroup(groupId) {
  await prisma.authorization_audit.deleteMany({ where: { target_type: 'group', target_id: groupId } });
  // group_closure and group_user cascade on group deletion
  await prisma.group.deleteMany({ where: { id: groupId } });
}

/**
 * Delete a user by id.
 */
async function deleteUser(userId) {
  await prisma.user.deleteMany({ where: { id: userId } });
}

module.exports = {
  createTestUser,
  createTestGroup,
  createTestChildGroup,
  createTestDataset,
  createTestCollection,
  getAccessTypeId,
  // cleanup
  deleteAccessRequests,
  deleteGrants,
  deleteGrantsForResource,
  deleteDataset,
  deleteCollection,
  deleteGroup,
  deleteUser,
};

/**
 * serviceStateChecks.test.js
 *
 * The services ask the state layer, so a call that reaches one directly is refused with 409 even
 * though no authorization check ran. These calls go straight to the services, which is the case a
 * group archived between the middleware's decision and the write reaches.
 *
 * It also pins the half of decision D2 that is easy to lose: archiving reaches the group itself
 * and what it owns, and a sub-group keeps its own state.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 2: every service checks state
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const collectionsService = require('@/services/collections');
const datasetsService = require('@/services/datasets_v2');
const grantsService = require('@/services/grants');
const invitationsService = require('@/services/invitations');
const accessRequestsService = require('@/services/access_requests');
const Expiry = require('@/utils/expiry');
const {
  activeMembership,
  createTestUser,
  createTestGroup,
  createTestChildGroup,
  createTestDataset,
  createTestCollection,
  createTestGrant,
  getAccessTypeId,
  deleteAccessRequests,
  deleteCollection,
  deleteDataset,
  deleteGrantsForResource,
  deleteGroup,
  deleteUser,
} = require('../services/helpers');

let actor;
let joiner;
/** Archived, with a collection and a dataset of its own. */
let archived;
let collection;
let dataset;
let grant;
let invitation;
/** An archived parent with an active child, for the one-step rule. */
let parent;
let child;
/** A dataset the active child owns, so its own state admits every change. */
let openDataset;
/** Access the archived group holds on that dataset, given before archiving. */
let heldByArchived;
/** Requests filed before archiving: two on the archived group's dataset, one for the group itself. */
let draftOnArchived;
let reviewOnArchived;
let draftForArchivedGroup;
let viewMetadataId;

const conflict = expect.objectContaining({ status: 409 });
/** A 409 that names the archived resource or group, so a version conflict cannot pass for it. */
const frozenBy = (words) => expect.objectContaining({ status: 409, message: expect.stringContaining(words) });
const RESOURCE_ARCHIVED = 'this request concerns is archived';
const GROUP_ARCHIVED_REQUEST = 'The group this request is for is archived';
const GROUP_ARCHIVED_GRANT = 'for an archived group';

beforeAll(async () => {
  actor = await createTestUser('_scs_actor');
  joiner = await createTestUser('_scs_joiner');

  archived = await createTestGroup(actor.subject_id, '_scs_archived');
  await prisma.group_user.createMany({
    data: [
      { group_id: archived.id, user_id: actor.subject_id, role: 'ADMIN' },
      { group_id: archived.id, user_id: joiner.subject_id, role: 'MEMBER' },
    ],
  });
  collection = await createTestCollection(archived.id, actor.subject_id, '_scs_coll');
  dataset = await createTestDataset(archived.id, '_scs_ds');
  grant = await createTestGrant({
    subject_id: joiner.subject_id,
    resource_id: dataset.resource_id,
    access_type_id: await getAccessTypeId('DATASET:VIEW_METADATA'),
    granted_by: actor.subject_id,
  });
  ({ invitation } = await invitationsService.createInvitation({
    group_id: archived.id, email: `scs_${Date.now()}@example.org`, invited_by: actor.subject_id,
  }));

  parent = await createTestGroup(actor.subject_id, '_scs_parent');
  child = await createTestChildGroup(parent.id, actor.subject_id, '_scs_child');
  await prisma.group_user.create({
    data: { group_id: child.id, user_id: actor.subject_id, role: 'ADMIN' },
  });

  viewMetadataId = await getAccessTypeId('DATASET:VIEW_METADATA');
  openDataset = await createTestDataset(child.id, '_scs_open_ds');
  heldByArchived = await createTestGrant({
    subject_id: archived.id,
    resource_id: openDataset.resource_id,
    access_type_id: viewMetadataId,
    granted_by: actor.subject_id,
  });
  draftOnArchived = await accessRequestsService.createAccessRequest({
    type: 'NEW',
    resource_id: dataset.resource_id,
    subject_id: joiner.subject_id,
    items: [{ access_type_id: await getAccessTypeId('DATASET:DOWNLOAD') }],
  }, joiner.subject_id);
  reviewOnArchived = await accessRequestsService.createAndSubmitAccessRequest({
    type: 'NEW',
    resource_id: dataset.resource_id,
    subject_id: joiner.subject_id,
    items: [{ access_type_id: await getAccessTypeId('DATASET:LIST_FILES') }],
  }, joiner.subject_id);
  draftForArchivedGroup = await accessRequestsService.createAccessRequest({
    type: 'NEW',
    resource_id: openDataset.resource_id,
    subject_id: archived.id,
    items: [{ access_type_id: await getAccessTypeId('DATASET:DOWNLOAD') }],
  }, actor.subject_id);

  await groupsService.archiveGroup(archived.id, actor.subject_id);
  await groupsService.archiveGroup(parent.id, actor.subject_id);
}, 60_000);

afterAll(async () => {
  await groupsService.unarchiveGroup(archived.id, actor.subject_id).catch(() => {});
  await groupsService.unarchiveGroup(parent.id, actor.subject_id).catch(() => {});
  await prisma.group_invitation.deleteMany({ where: { group_id: archived.id } });
  await deleteAccessRequests({ requesterIds: [actor.subject_id, joiner.subject_id] }).catch(() => {});
  await deleteGrantsForResource(dataset.resource_id).catch(() => {});
  await deleteGrantsForResource(openDataset.resource_id).catch(() => {});
  await deleteDataset(openDataset.id).catch(() => {});
  await deleteCollection(collection.id).catch(() => {});
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(child.id).catch(() => {});
  await deleteGroup(parent.id).catch(() => {});
  await deleteGroup(archived.id).catch(() => {});
  await deleteUser(joiner.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 60_000);

describe('an archived group', () => {
  test('refuses every membership change', async () => {
    await expect(groupsService.addGroupMembers(archived.id, {
      user_ids: [joiner.subject_id], actor_id: actor.subject_id,
    })).rejects.toEqual(conflict);
    await expect(groupsService.removeGroupMembers(archived.id, {
      user_ids: [joiner.subject_id], actor_id: actor.subject_id,
    })).rejects.toEqual(conflict);
    await expect(groupsService.promoteGroupMemberToAdmin(archived.id, {
      user_id: joiner.subject_id, actor_id: actor.subject_id,
    })).rejects.toEqual(conflict);
    await expect(groupsService.demoteAdminToMember(archived.id, {
      user_id: actor.subject_id, actor_id: actor.subject_id,
    })).rejects.toEqual(conflict);
  });

  test('refuses an edit, a sub-group, and an invitation', async () => {
    const { version } = await prisma.group.findUnique({ where: { id: archived.id } });
    await expect(groupsService.updateGroupMetadata(archived.id, {
      data: { description: 'refused' }, expected_version: version, actor_id: actor.subject_id,
    })).rejects.toEqual(conflict);
    await expect(createTestChildGroup(archived.id, actor.subject_id, '_scs_refused'))
      .rejects.toEqual(conflict);
    await expect(invitationsService.createInvitation({
      group_id: archived.id, email: `scs2_${Date.now()}@example.org`, invited_by: actor.subject_id,
    })).rejects.toEqual(conflict);
  });

  test('refuses withdrawing an invitation it already issued', async () => {
    await expect(invitationsService.cancelInvitation({
      group_id: archived.id, invitation_id: invitation.id,
    })).rejects.toEqual(conflict);
  });

  test('leaves its invitations invalid rather than spendable', async () => {
    const { token } = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
    expect(await invitationsService.checkInvitationToken(token)).toEqual({ status: 'invalid' });
  });

  test('refuses archiving twice, and answers what it is', async () => {
    await expect(groupsService.archiveGroup(archived.id, actor.subject_id))
      .rejects.toMatchObject({ status: 409, message: 'This group is already archived.' });
  });
});

describe('a collection owned by an archived group', () => {
  test('is not archived on its own column', async () => {
    // Forced unless the rule reads one step up: a check on the collection's own column alone
    // would let every call below through.
    const row = await prisma.collection.findUnique({ where: { id: collection.id } });
    expect(row.is_archived).toBe(false);
  });

  test('refuses an edit, a membership change of its datasets, and its deletion', async () => {
    const { version } = await prisma.collection.findUnique({ where: { id: collection.id } });
    await expect(collectionsService.updateCollectionMetadata(collection.id, {
      data: { description: 'refused' }, expected_version: version,
    })).rejects.toEqual(conflict);
    await expect(collectionsService.addDatasets(collection.id, {
      dataset_ids: [dataset.resource_id], actor_id: actor.subject_id,
    })).rejects.toEqual(conflict);
    await expect(collectionsService.removeDatasets(collection.id, {
      dataset_ids: [dataset.resource_id], actor_id: actor.subject_id,
    })).rejects.toEqual(conflict);
    await expect(collectionsService.deleteCollection(collection.id, actor.subject_id))
      .rejects.toEqual(conflict);
  });
});

describe('a dataset owned by an archived group', () => {
  test('refuses a metadata edit and a delete', async () => {
    await expect(datasetsService.patchDataset(dataset.id, { name: 'refused' }))
      .rejects.toEqual(conflict);
    await expect(datasetsService.softDelete(dataset.id, actor.id))
      .rejects.toEqual(conflict);
  });

  test('refuses a grant issue and a revoke, because access stops changing', async () => {
    await expect(grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id }))
      .rejects.toEqual(conflict);
    await expect(grantsService.revokeAllGrants(joiner.subject_id, dataset.resource_id, {
      actor_id: actor.subject_id,
    })).rejects.toEqual(conflict);
  });
});

// Archiving freezes a request: no step moves, withdrawing included, and nothing is cancelled.
// @see docs/design/groups/design.md — Lifecycle Management
describe('a request on a dataset an archived group owns', () => {
  test('refuses an edit and a withdrawal, as it refuses a submission and a review', async () => {
    await expect(accessRequestsService.updateAccessRequest(draftOnArchived.id, joiner.subject_id, {
      purpose: 'refused while archived',
    })).rejects.toEqual(frozenBy(RESOURCE_ARCHIVED));
    await expect(accessRequestsService.withdrawRequest({
      request_id: draftOnArchived.id, requester_id: joiner.subject_id,
    })).rejects.toEqual(frozenBy(RESOURCE_ARCHIVED));
    await expect(accessRequestsService.withdrawRequest({
      request_id: reviewOnArchived.id, requester_id: joiner.subject_id,
    })).rejects.toEqual(frozenBy(RESOURCE_ARCHIVED));
    await expect(accessRequestsService.submitRequest(draftOnArchived.id, joiner.subject_id))
      .rejects.toEqual(frozenBy(RESOURCE_ARCHIVED));
  });

  test('stays exactly as it was, so unarchiving resumes it', async () => {
    const rows = await prisma.access_request.findMany({
      where: { id: { in: [draftOnArchived.id, reviewOnArchived.id] } },
      select: { id: true, status: true },
    });
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      [draftOnArchived.id]: 'DRAFT',
      [reviewOnArchived.id]: 'UNDER_REVIEW',
    });
  });
});

describe('an archived group as the one access is for', () => {
  test('takes no new access, while an active group does', async () => {
    const issueTo = (subject_id) => prisma.$transaction((tx) => grantsService.issueGrants(tx, {
      subject_id,
      resource_id: openDataset.resource_id,
      granted_by: actor.subject_id,
      justification: 'serviceStateChecks',
    }, [{ access_type_id: viewMetadataId, approved_expiry: Expiry.never() }]));

    await expect(issueTo(archived.id)).rejects.toEqual(frozenBy(GROUP_ARCHIVED_GRANT));
    // The sensitivity pair: the same dataset and access type, for a group that is not archived.
    await issueTo(child.id);
    expect(await prisma.grant.count({
      where: { subject_id: child.id, resource_id: openDataset.resource_id, revoked_at: null },
    })).toBe(1);
  });

  test('has no request filed for it, and the one it has does not move', async () => {
    await expect(accessRequestsService.createAccessRequest({
      type: 'NEW',
      resource_id: openDataset.resource_id,
      subject_id: archived.id,
      items: [{ access_type_id: viewMetadataId }],
    }, actor.subject_id)).rejects.toEqual(frozenBy(GROUP_ARCHIVED_REQUEST));
    await expect(accessRequestsService.withdrawRequest({
      request_id: draftForArchivedGroup.id, requester_id: actor.subject_id,
    })).rejects.toEqual(frozenBy(GROUP_ARCHIVED_REQUEST));
  });

  test('can still have its access revoked by the group that governs the resource', async () => {
    // The dataset belongs to an active group, whose admins keep the power to take access away.
    await grantsService.revokeGrant(heldByArchived.id, { actor_id: actor.subject_id });
    const row = await prisma.grant.findUnique({ where: { id: heldByArchived.id } });
    expect(row.revoked_at).not.toBeNull();
  });
});

describe('a sub-group of an archived group', () => {
  test('keeps its own state, so its own changes go through', async () => {
    // Archiving reaches the group it names and what that group owns. A sub-group is governed by
    // the parent and owned by nobody, so it stays active until somebody archives it.
    // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
    const row = await prisma.group.findUnique({ where: { id: child.id } });
    expect(row.is_archived).toBe(false);

    await groupsService.addGroupMembers(child.id, {
      user_ids: [joiner.subject_id], actor_id: actor.subject_id,
    });
    expect(await activeMembership(child.id, joiner.subject_id)).not.toBeNull();

    const { version } = await prisma.group.findUnique({ where: { id: child.id } });
    await groupsService.updateGroupMetadata(child.id, {
      data: { description: 'allowed' }, expected_version: version, actor_id: actor.subject_id,
    });
    const after = await prisma.group.findUnique({ where: { id: child.id } });
    expect(after.description).toBe('allowed');
  });
});

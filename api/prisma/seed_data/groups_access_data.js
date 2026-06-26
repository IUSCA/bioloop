const dayjs = require('dayjs');
const { Prisma, GRANT_CREATION_TYPE } = require('@prisma/client');
const { EVERYONE_GROUP_ID } = require('../../src/constants');
const { createDeterministicUuidGenerator } = require('./deterministic_uuid');
// cSpell: ignore tmpl
/**
 * Generate deterministic seed data for grants and access requests.
 *
 * This helper is designed to support seeding environments with a stable,
 * reproducible set of authorization fixtures that cover a variety of common
 * access control scenarios.
 *
 * Input:
 *   - groups: array of Prisma group records (including `members`,
 *     `owned_datasets`, and `owned_collections` relations) fetched via
 *     `prisma.group.findMany({ include: { members: true, owned_datasets: true, owned_collections: true } })`.
 *   - systemAdminSubjectId: subject_id of the system admin user used as a
 *     fallback grantor/approver when no group admin exists.
 *
 * Behaviors:
 *   1. Sorts groups deterministically by id.
 *   2. Flattens membership info (group members + roles) into a simple
 *      `groupUsers` array.
 *   3. Builds sorted lists of owned datasets and collections for each group.
 *   4. Selects two consistent "granting" groups (first two after sorting).
 *   5. Generates a set of grants covering:
 *        - dataset grants (user & group subjects)
 *        - collection grants (user & group subjects)
 *        - membership scenarios (same group vs different group)
 *        - varying statuses (active, revoked, expired)
 *        - a global grant to the EVERYONE group
 *   6. Generates a set of access requests with varied statuses (draft, review,
 *      approved, partially approved, rejected, withdrawn, expired) and maps
 *      them to request items.
 *
 * The output is intentionally deterministic to make seed runs reproducible.
 */
function generateGroupAccessSeedData({
  groups = [],
  systemAdminSubjectId,
}) {
  // Keep output deterministic; UUID generator starts at 3000 to avoid conflict.
  const generate = createDeterministicUuidGenerator(3000n);

  // Normalize and sort groups for deterministic behavior
  const sortedGroups = [...groups].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  // Flatten group membership data into a consistent shape
  const groupUsers = sortedGroups.flatMap((group) => {
    const members = group.members || [];
    return members
      .sort((a, b) => String(a.user_id).localeCompare(String(b.user_id)))
      .map((member) => ({
        group_id: group.id,
        user_id: member.user_id,
        role: member.role,
      }));
  });

  // Flatten owned datasets and collections so it's easy to query by owner
  const datasets = sortedGroups.flatMap((group) => (group.owned_datasets || []).map((d) => ({
    ...d,
    owner_group_id: group.id,
  })));
  const collections = sortedGroups.flatMap((group) => (group.owned_collections || []).map((c) => ({
    ...c,
    owner_group_id: group.id,
  })));

  const sortById = (arr, idKey = 'id') => [...(arr || [])]
    .sort((a, b) => String(a[idKey])
      .localeCompare(String(b[idKey])));

  const datasetsSorted = sortById(datasets, 'resource_id');
  const collectionsSorted = sortById(collections, 'id');

  const groupById = (items, key = 'group_id') => (items || []).reduce((acc, item) => {
    acc[item[key]] = acc[item[key]] || [];
    acc[item[key]].push(item);
    return acc;
  }, {});

  const groupUsersByGroup = groupById(groupUsers, 'group_id');
  const datasetByOwner = groupById(datasetsSorted, 'owner_group_id');
  const collectionByOwner = groupById(collectionsSorted, 'owner_group_id');

  // Pick two distinct groups to act as granting groups
  const grantingGroups = sortedGroups.slice(0, 2);

  const grants = [];

  grantingGroups.forEach((grantingGroup) => {
    const groupMembers = groupUsersByGroup[grantingGroup.id] || [];
    const admins = groupMembers.filter((m) => m.role === 'ADMIN');
    const members = groupMembers.filter((m) => m.role !== 'ADMIN');
    const grantor = admins.length > 0 ? admins[0].user_id : systemAdminSubjectId;

    // Choose user from same group and another group
    const sameGroupUser = members.length > 0 ? members[0].user_id : grantor;
    const otherGroupUser = groupUsers.find((m) => m.group_id !== grantingGroup.id)?.user_id || grantor;

    // Choose datasets/collections owned by this granting group only.
    // Group admins should not be able to grant access to resources owned by other groups.
    const groupDatasets = datasetByOwner[grantingGroup.id] || [];
    const groupCollections = collectionByOwner[grantingGroup.id] || [];

    const datasetSame = groupDatasets[0] || datasetsSorted[0];
    const datasetOther = groupDatasets[1] || datasetSame; // second dataset within the group (if available)
    const collectionSame = groupCollections[0] || collectionsSorted[0];
    const collectionOther = groupCollections[1] || collectionSame; // second collection within the group (if available)

    // Create grants for each requested category (with varying statuses)
    const grantTemplates = [
      {
        description: 'Dataset grant to user in same group (active)',
        resource_id: datasetSame?.resource_id,
        subject_id: sameGroupUser,
        access_type_id: 4, // DATASET:LIST_FILES
        valid_from: new Date(),
        created_at: new Date(),
      },
      {
        description: 'Dataset grant to user in different group (expired)',
        resource_id: datasetOther?.resource_id,
        subject_id: otherGroupUser,
        access_type_id: 4,
        valid_from: dayjs().subtract(60, 'day').toDate(),
        valid_until: dayjs().subtract(1, 'day').toDate(),
        created_at: dayjs().subtract(60, 'day').toDate(),
      },
      {
        description: 'Collection grant to user in same group (revoked)',
        resource_id: collectionSame?.id,
        subject_id: sameGroupUser,
        access_type_id: 9, // COLLECTION:LIST_CONTENTS
        valid_from: dayjs().subtract(10, 'day').toDate(),
        revoked_at: new Date(),
        revoked_by: grantor,
        created_at: dayjs().subtract(10, 'day').toDate(),
      },
      {
        description: 'Collection grant to user in different group (active)',
        resource_id: collectionOther?.id,
        subject_id: otherGroupUser,
        access_type_id: 9,
        valid_from: dayjs().subtract(2, 'day').toDate(),
        created_at: dayjs().subtract(2, 'day').toDate(),
      },
      {
        description: 'Dataset grant to same group (group subject)',
        resource_id: datasetSame?.resource_id,
        subject_id: grantingGroup.id,
        access_type_id: 4,
        valid_from: dayjs().subtract(5, 'day').toDate(),
        created_at: dayjs().subtract(5, 'day').toDate(),
      },
      {
        description: 'Dataset grant to different group (group subject, expired)',
        resource_id: datasetOther?.resource_id,
        subject_id: sortedGroups.find((g) => g.id !== grantingGroup.id)?.id,
        access_type_id: 4,
        valid_from: dayjs().subtract(60, 'day').toDate(),
        valid_until: dayjs().subtract(1, 'day').toDate(),
        created_at: dayjs().subtract(60, 'day').toDate(),
      },
      {
        description: 'Collection grant to same group (group subject)',
        resource_id: collectionSame?.id,
        subject_id: grantingGroup.id,
        access_type_id: 9,
        valid_from: dayjs().subtract(7, 'day').toDate(),
        created_at: dayjs().subtract(7, 'day').toDate(),
      },
      {
        description: 'Collection grant to different group (group subject, revoked)',
        resource_id: collectionOther?.id,
        subject_id: sortedGroups.find((g) => g.id !== grantingGroup.id)?.id,
        access_type_id: 9,
        valid_from: dayjs().subtract(10, 'day').toDate(),
        revoked_at: new Date(),
        revoked_by: grantor,
        created_at: dayjs().subtract(10, 'day').toDate(),
      },
    ];

    grantTemplates.forEach((tmpl) => {
      if (tmpl.resource_id && tmpl.subject_id) {
        grants.push({
          id: generate(),
          subject_id: tmpl.subject_id,
          resource_id: tmpl.resource_id,
          access_type_id: tmpl.access_type_id,
          granted_by: grantor,
          creation_type: GRANT_CREATION_TYPE.MANUAL,
          valid_from: tmpl.valid_from ?? Prisma.skip,
          valid_until: tmpl.valid_until ?? Prisma.skip,
          revoked_at: tmpl.revoked_at ?? Prisma.skip,
          revoked_by: tmpl.revoked_by ?? Prisma.skip,
          created_at: tmpl.created_at ?? Prisma.skip,
        });
      }
    });
  });

  // Grant to EVERYONE group (active)
  grants.push({
    id: generate(),
    subject_id: EVERYONE_GROUP_ID,
    resource_id: datasetsSorted[0]?.resource_id,
    access_type_id: 1, // DATASET:VIEW_METADATA
    granted_by: systemAdminSubjectId,
    creation_type: GRANT_CREATION_TYPE.MANUAL,
    valid_from: new Date(),
    created_at: new Date(),
  });

  // Build access requests aligned with grant types
  const requestSeeds = [];
  const requester = groupUsers[0]?.user_id || systemAdminSubjectId;
  const otherRequester = groupUsers.find((m) => m.user_id !== requester)?.user_id || requester;

  const baseDate = dayjs().subtract(7, 'day').toDate();
  const makeReq = (status, resource_id, requester_id) => {
    const updatedAt = status === 'DRAFT' ? baseDate : dayjs(baseDate).add(1, 'day').toDate();
    const submittedAt = status !== 'DRAFT' ? dayjs(baseDate).add(1, 'day').toDate() : undefined;
    const reviewedBy = status !== 'DRAFT' ? systemAdminSubjectId : undefined;
    const reviewedAt = ['APPROVED', 'REJECTED', 'PARTIALLY_APPROVED'].includes(status)
      ? dayjs(baseDate).add(2, 'day').toDate()
      : undefined;

    let closedAt;
    if (status === 'WITHDRAWN') {
      closedAt = dayjs(baseDate).add(1, 'day').toDate();
    } else if (status === 'EXPIRED') {
      closedAt = dayjs(baseDate).add(30, 'day').toDate();
    } else if (['APPROVED', 'REJECTED', 'PARTIALLY_APPROVED'].includes(status)) {
      closedAt = dayjs(baseDate).add(2, 'day').toDate();
    }

    let decisionReason;
    if (status === 'REJECTED') {
      decisionReason = 'Denied for test.';
    } else if (status === 'PARTIALLY_APPROVED') {
      decisionReason = 'Partially approved for limited access.';
    }

    return {
      id: generate(),
      type: 'NEW',
      resource_id,
      subject_id: requester_id, // request is for self in this seed data
      requester_id,
      purpose: `Seeded request (${status})`,
      status,
      created_at: baseDate ?? Prisma.skip,
      updated_at: updatedAt ?? Prisma.skip,
      submitted_at: submittedAt ?? Prisma.skip,
      reviewed_by: reviewedBy ?? Prisma.skip,
      reviewed_at: reviewedAt ?? Prisma.skip,
      closed_at: closedAt ?? Prisma.skip,
      decision_reason: decisionReason ?? Prisma.skip,
    };
  };

  requestSeeds.push(makeReq('DRAFT', datasetsSorted[0]?.resource_id, requester));
  requestSeeds.push(makeReq('UNDER_REVIEW', collectionsSorted[0]?.id, otherRequester));
  requestSeeds.push(makeReq('APPROVED', datasetsSorted[0]?.resource_id, requester));
  requestSeeds.push(makeReq('PARTIALLY_APPROVED', datasetsSorted[0]?.resource_id, otherRequester));
  requestSeeds.push(makeReq('REJECTED', collectionsSorted[0]?.id, requester));
  requestSeeds.push(makeReq('WITHDRAWN', datasetsSorted[0]?.resource_id, otherRequester));
  requestSeeds.push(makeReq('EXPIRED', datasetsSorted[0]?.resource_id, requester));

  const requestItems = [];
  requestSeeds.forEach((req) => {
    const createItem = (access_type_id, decision) => ({
      id: generate(),
      access_request_id: req.id,
      access_type_id,
      decision: decision ?? Prisma.skip,
    });

    if (req.status === 'DRAFT') {
      requestItems.push(createItem(1, 'PENDING'));
      requestItems.push(createItem(4, 'PENDING'));
      return;
    }

    if (req.status === 'UNDER_REVIEW') {
      requestItems.push(createItem(4, 'PENDING'));
      return;
    }

    if (req.status === 'APPROVED') {
      const grantId = grants.find((g) => g.subject_id === req.requester_id && g.resource_id === req.resource_id)?.id;
      requestItems.push(createItem(1, 'APPROVED', grantId));
      requestItems.push(createItem(4, 'APPROVED', grantId));
      return;
    }

    if (req.status === 'PARTIALLY_APPROVED') {
      const grantId = grants.find((g) => g.subject_id === req.requester_id && g.resource_id === req.resource_id)?.id;
      requestItems.push(createItem(1, 'APPROVED', grantId));
      requestItems.push(createItem(4, 'REJECTED'));
      return;
    }

    // REJECTED / WITHDRAWN / EXPIRED
    requestItems.push(createItem(4, 'PENDING'));
  });

  return {
    grants,
    accessRequests: requestSeeds,
    accessRequestItems: requestItems,
  };
}

module.exports = {
  generateGroupAccessSeedData,
};

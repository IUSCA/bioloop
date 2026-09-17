const { Prisma, GROUP_MEMBER_ROLE } = require('@prisma/client');
const _ = require('lodash/fp');
const createError = require('http-errors');
const { randomUUID } = require('crypto');

const prisma = require('@/db');
const { accessPathsQuery } = require('@/authorization');

const { generate_slug } = require('@/utils/slug');
const audit = require('@/services/audit');

const { AuditBuilder } = audit;
const { resolveEntityName } = require('@/services/audit/helpers');
const sqlUtils = require('@/utils/sql');
const { SYSTEM_PRINCIPAL_GROUP_IDS } = require('@/constants');
const { assertNotSystemPrincipal } = require('@/services/system_principals');
const { assertPossible, withStateFields } = require('@/state').import('group');
const assert = require('assert');

const PRISMA_GROUP_INCLUDES = {};

/**
 * Whether a write failed because another group already holds the name.
 *
 * `group.name` is unique across every group, archived ones and ones the caller cannot see
 * included, so the refusal names no other group.
 */
function isGroupNameTaken(e) {
  return e instanceof Prisma.PrismaClientKnownRequestError
    && e.code === 'P2002'
    && Array.isArray(e.meta?.target) && e.meta.target.includes('name');
}

/** The 409 for a taken group name. `field` tells a form which input to mark. */
function groupNameTakenError() {
  return createError(409, 'This name is already taken. Group names must be unique across the whole system.', {
    field: 'name',
  });
}

// eslint-disable-next-line max-len
const CONFLICT_ERROR_MESSAGE = 'Failed to update group metadata due to concurrent modification. Please refresh and try again.';

/** Helper function to create audit records for group member role changes
 * @param {Prisma.TransactionClient} tx - Prisma transaction client
 * @param {string} eventType - audit.AUTH_EVENT_TYPE to record
 * @param {string} actor_id - UUID of the user performing the action
 * @param {Array<string>} user_ids - UUIDs of the affected users
 * @param {string} group_id - UUID of the group
 * @param {string} groupName - Name of the group
 * @param {string} role - GROUP_MEMBER_ROLE being assigned
 * @returns {Promise<void>}
 */
async function createMembershipAuditRecords(tx, {
  eventType, actor_id, user_ids, group_id, groupName, role,
}) {
  if (user_ids.length === 0) return;

  const builder = new AuditBuilder(tx, { actor_id });
  await builder
    .setTarget(audit.TARGET_TYPE.GROUP, group_id, groupName)
    .mergeMetadata({ role });
  await builder.createBatch(tx, eventType, user_ids.map((user_id) => ({
    subject_id: user_id,
    subject_type: audit.SUBJECT_TYPE.USER,
  })));
}

async function _getGroup(by, value) {
  assert(by === 'id' || by === 'slug', 'Invalid "by" parameter');
  const group = await prisma.group.findUniqueOrThrow(withStateFields({
    where: { [by]: value },
    include: {
      ancestor_edges: {
        include: {
          ancestor: true,
        },
        orderBy: {
          depth: 'desc',
        },
      },
      members: {
        where: {
          user: { is_deleted: false },
          role: GROUP_MEMBER_ROLE.ADMIN,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              subject_id: true,
            },
          },
        },
      },
      _count: {
        select: {
          members: true,
        },
      },
    },
  }));
  const {
    ancestor_edges, members, ...groupData
  } = group;
  const ancestors = ancestor_edges
    .filter((edge) => edge.depth > 0) // exclude self-edge with depth 0
    .map((edge) => ({
      depth: edge.depth,
      ...edge.ancestor,
    }));
  return {
    ancestors,
    admins: members.map((member) => member.user),
    ...groupData,
  };
}

/**
 * Get group by ID
 * @param {string} group_id - ID of the group
 * @returns {Promise<Object>} Group object with members
 */
async function getGroupById(group_id) {
  return _getGroup('id', group_id);
}

/**
 * Get group by Slug
 * @param {string} slug - Slug of the group
 * @returns {Promise<Object>} Group object with members
 */
async function getGroupBySlug(slug) {
  return _getGroup('slug', slug);
}

/** Helper function to get ancestor groups with depth information within a transaction
 * @param {Prisma.TransactionClient} tx - Prisma transaction client
 * @param {string} group_id - ID of the group to get ancestors for
 * @returns {Promise<Array<{id: string, name: string, slug: string, depth: number}>>} List of ancestor groups with depth
 */
async function getAncestorGroups(tx, group_id) {
  const ancestors = await tx.group_closure.findMany({
    where: { descendant_id: group_id, depth: { gt: 0 } },
    include: {
      ancestor: true,
    },
    orderBy: {
      depth: 'asc',
    },
  });
  return ancestors.map((entry) => ({ ...entry.ancestor, depth: entry.depth }));
}

/** Helper function to get descendant groups with depth information within a transaction
 * @param {Prisma.TransactionClient} tx - Prisma transaction client
 * @param {string} group_id - ID of the group to get descendants for
 * @returns {Promise<Array<{id: string, name: string, slug: string, depth: number}>>} List of descendant groups with depth
 */
async function getDescendantGroups(tx, group_id) {
  const descendants = await tx.group_closure.findMany({
    where: { ancestor_id: group_id, depth: { gt: 0 } },
    include: {
      descendant: true,
    },
    orderBy: {
      depth: 'asc',
    },
  });
  return descendants.map((entry) => ({ ...entry.descendant, depth: entry.depth }));
}

/** Factory function to create a slug uniqueness check function that operates within a transaction
 * @param {Prisma.TransactionClient} tx - Prisma transaction client
 * @returns {function(string): Promise<boolean>} Function that checks if a slug is unique within the transaction
 */
function make_slug_unique_fn(tx) {
  return async (_slug) => {
    const existingGroup = await tx.group.findUnique({
      where: { slug: _slug },
      select: { id: true },
    });
    return !existingGroup;
  };
}

/**
 * Create a new child group under a parent group
 * @param {Object} options - Optional members and admins to add to the group
 * @param {Object} options.data - Group creation data
 * @param {string} options.data.name - Group name (unique)
 * @param {string} [options.data.description] - Optional description
 * @param {boolean} [options.data.allow_user_contributions] - Whether users can upload
 * @param {Object} [options.data.metadata] - Additional metadata
 * @param {string} [options.parent_id] - ID of the parent group
 * @param {string} options.actor_id - UUID of the user creating the group
 * @param {Array<string>} [options.members] - UUIDs of users to add as members
 * @param {Array<string>} [options.admins] - UUIDs of users to add as admins
 * @returns {Promise<Object>} Created group with closure entries
 */
/**
 * Locks a group row, then reads it with the fields its state rules read.
 *
 * The lock comes before the state check, so an archive committed by another transaction either
 * lands before this read or waits for this transaction to finish. The state a write sees is
 * therefore the state the check read. A raw lock cannot take the state layer's select fragment,
 * so the row is read after it rather than by it.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} group_id
 * @returns {Promise<Object>} every column of the group, and the state fields
 * @throws {HttpError} 404 when no group has that id
 */
async function lockGroup(tx, group_id) {
  const rows = await tx.$queryRaw`SELECT id FROM "group" WHERE id = ${group_id} FOR UPDATE`;
  if (rows.length === 0) throw createError.NotFound('Group not found');
  return tx.group.findUniqueOrThrow(withStateFields({ where: { id: group_id } }));
}

async function createGroup({
  data, actor_id, parent_id = null, members = [], admins = [],
}) {
  return prisma.$transaction(async (tx) => {
    // Archiving reaches the group itself and what it owns, so an archived parent takes no new
    // sub-group. A deeper descendant of an archived group keeps its own state.
    if (parent_id != null) {
      assertNotSystemPrincipal(parent_id, 'parent');
      assertPossible('create_child', await lockGroup(tx, parent_id));
    }

    // create slug - URL-friendly identifier based on name, e.g. "My Group" -> "my-group"
    const slug = await generate_slug({
      name: data.name,
      is_slug_unique_fn: make_slug_unique_fn(tx),
    });

    const id = randomUUID();

    // subject row must be created first — group.id is a direct FK to subject.id
    await tx.subject.create({ data: { id, type: 'GROUP' } });

    // create the new group
    const _group = await tx.group.create({
      data: {
        id,
        name: data.name,
        slug,
        // Frozen at creation. updateGroup regenerates slug on rename and must never touch
        // this, or a rename would fragment the group's archive directory.
        // @see docs/design/groups/dataset-storage.md — Archival
        archive_key: slug,
        description: data.description ?? Prisma.skip,
        allow_user_contributions: data.allow_user_contributions ?? Prisma.skip,
        metadata: data.metadata ?? Prisma.skip,
      },
      include: PRISMA_GROUP_INCLUDES,
    }).catch((e) => {
      throw isGroupNameTaken(e) ? groupNameTakenError() : e;
    });

    // create closure entry for group being its own ancestor
    // and link to parent group
    // and link to ancestor groups of parent group (transitive closure)
    const closureEntries = [
      {
        ancestor_id: _group.id,
        descendant_id: _group.id,
        depth: 0,
      },
    ];
    let ancestorClosureEntries = [];

    if (parent_id != null) {
      const parentAncestorEntries = await tx.group_closure.findMany({
        where: { descendant_id: parent_id, depth: { gte: 0 } },
        orderBy: {
          depth: 'asc',
        },
      });
      ancestorClosureEntries = parentAncestorEntries.map((row) => ({
        ancestor_id: row.ancestor_id,
        descendant_id: _group.id,
        depth: row.depth + 1,
      }));
    }
    await tx.group_closure.createMany({
      data: [...closureEntries, ...ancestorClosureEntries],
    });

    // Since this is a new child group, it won't have any descendants yet,
    // so we don't need to create closure entries for descendant groups

    // create audit record for group creation
    const builder = new AuditBuilder(tx, { actor_id });
    await builder
      .setTarget(audit.TARGET_TYPE.GROUP, _group.id, _group.name)
      .mergeMetadata({
        group_hierarchy_type: parent_id ? 'CHILD' : 'ROOT',
      });
    if (parent_id != null) {
      const parentName = await resolveEntityName(tx, 'group', parent_id);
      builder.mergeMetadata({
        parent_id,
        parent_name: parentName,
      });
    }
    await builder.create(tx, audit.AUTH_EVENT_TYPE.GROUP_CREATED);

    // Add members and admins if provided
    // deduplicate user IDs
    const membersSet = new Set(members);
    const adminsSet = new Set(admins);
    const allUserIds = [...membersSet, ...adminsSet];

    if (allUserIds.length > 0) {
      // Determine IDs to add as members (exclude those who will be admins)
      const memberIds = members.filter((_id) => !admins.includes(_id));
      const groupName = _group.name;

      // Add regular members
      if (memberIds.length > 0) {
        const createdMemberRecords = await tx.$queryRaw`
          INSERT INTO group_user (group_id, user_id, role)
          SELECT ${_group.id}, u.subject_id, ${sqlUtils.enumToSql(GROUP_MEMBER_ROLE.MEMBER)}
          FROM "user" u
          WHERE u.subject_id = ANY(${memberIds}::text[])
          ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING
          RETURNING user_id;
        `;
        const createdMemberUserIds = createdMemberRecords.map((record) => record.user_id);

        // Create audit records for member additions
        await createMembershipAuditRecords(tx, {
          eventType: audit.AUTH_EVENT_TYPE.GROUP_MEMBER_ADDED,
          actor_id,
          user_ids: createdMemberUserIds,
          group_id: _group.id,
          groupName,
          role: GROUP_MEMBER_ROLE.MEMBER,
        });
      }

      // Add admins
      if (admins.length > 0) {
        const createdAdminRecords = await tx.$queryRaw`
          INSERT INTO group_user (group_id, user_id, role)
          SELECT ${_group.id}, u.subject_id, ${sqlUtils.enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
          FROM "user" u
          WHERE u.subject_id = ANY(${admins}::text[])
          ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING
          RETURNING user_id;
        `;
        const createdAdminUserIds = createdAdminRecords.map((record) => record.user_id);

        // Create audit records for admin additions
        await createMembershipAuditRecords(tx, {
          eventType: audit.AUTH_EVENT_TYPE.GROUP_ADMIN_ADDED,
          actor_id,
          user_ids: createdAdminUserIds,
          group_id: _group.id,
          groupName,
          role: GROUP_MEMBER_ROLE.ADMIN,
        });
      }
    }

    return _group;
  });
}

/**
 * Update group metadata
 * @param {string} group_id - ID of the group to update
 * @param {Object} params - Update parameters
 * @param {Object} [params.data] - Metadata fields to update
 * @param {string} [params.data.name] - New group name (unique)
 * @param {string} [params.data.description] - New description
 * @param {boolean} [params.data.allow_user_contributions] - Whether users can upload
 * @param {Object} [params.data.metadata] - Additional metadata
 * @param {string} [params.actor_id] - UUID of the user performing the update (for audit)
 * @param {number} params.expected_version - Expected current version for optimistic concurrency control
 * @returns {Promise<Object>} Updated group object
 * @throws {createError.Conflict} If the update fails due to concurrent modification
 */
async function updateGroupMetadata(group_id, { data, expected_version, actor_id }) {
  return prisma.$transaction(async (tx) => {
    // check if name changed and if so, generate new slug
    let slug;
    const currentGroup = await lockGroup(tx, group_id);
    assertPossible('edit_metadata', currentGroup);

    if (data.name && data.name !== currentGroup.name) {
      slug = await generate_slug({
        name: data.name,
        is_slug_unique_fn: make_slug_unique_fn(tx),
      });
    }

    // deep merge metadata updates into existing metadata if provided
    let mergedMetadata;
    if (data.metadata) {
      mergedMetadata = _.merge(currentGroup.metadata)(data.metadata);
    }

    let updatedGroup;
    try {
      updatedGroup = await tx.group.update({
        where: {
          id: group_id,
          version: expected_version,
        },
        data: {
          name: data.name ?? Prisma.skip,
          slug: slug ?? Prisma.skip,
          description: data.description ?? Prisma.skip,
          allow_user_contributions: data.allow_user_contributions ?? Prisma.skip,
          metadata: mergedMetadata ?? Prisma.skip,
          version: { increment: 1 },
        },
        include: PRISMA_GROUP_INCLUDES,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError
        && (e.code === 'P2025' || e.code === 'P2015')) {
        throw createError.Conflict(CONFLICT_ERROR_MESSAGE);
      }
      if (isGroupNameTaken(e)) throw groupNameTakenError();
      throw e;
    }

    // determine which fields were changed and emit audit
    if (actor_id) {
      const changedFields = [];
      if (data.name && data.name !== currentGroup.name) changedFields.push('name');
      if (data.description !== undefined && data.description !== currentGroup.description) {
        changedFields.push('description');
      }
      if (
        data.allow_user_contributions !== undefined
        && data.allow_user_contributions !== currentGroup.allow_user_contributions
      ) {
        changedFields.push('allow_user_contributions');
      }
      if (data.metadata && !_.isEqual(data.metadata, currentGroup.metadata)) changedFields.push('metadata');

      if (changedFields.length > 0) {
        const builder = new AuditBuilder(tx, { actor_id });
        await builder
          .setTarget(audit.TARGET_TYPE.GROUP, group_id, updatedGroup.name)
          .mergeMetadata({ changed_fields: changedFields })
          .create(tx, audit.AUTH_EVENT_TYPE.GROUP_METADATA_UPDATED);
      }
    }

    return updatedGroup;
  });
}

/**
 * Archive a group
 * @param {string} group_id - ID of the group to archive
 * @param {string} actor_id - UUID of the user performing the archival (for audit)
 * @returns {Promise<Object>} The archived group object
 */
async function archiveGroup(group_id, actor_id) {
  return prisma.$transaction(async (tx) => {
    assertPossible('archive', await lockGroup(tx, group_id));

    const updatedGroup = await tx.group.update({
      where: { id: group_id },
      data: {
        is_archived: true,
        archived_at: new Date(),
      },
      include: PRISMA_GROUP_INCLUDES,
    });

    // create audit record for group archival
    const builder = new AuditBuilder(tx, { actor_id });
    await builder
      .setTarget(audit.TARGET_TYPE.GROUP, group_id, updatedGroup.name)
      .create(tx, audit.AUTH_EVENT_TYPE.GROUP_ARCHIVED);
    return updatedGroup;
  });
}

/**
 * Unarchive a group
 * @param {string} group_id - ID of the group to unarchive
 * @param {string} actor_id - UUID of the user performing the unarchival (for audit)
 * @returns {Promise<Object>} The unarchived group object
 */
async function unarchiveGroup(group_id, actor_id) {
  return prisma.$transaction(async (tx) => {
    assertPossible('unarchive', await lockGroup(tx, group_id));

    const updatedGroup = await tx.group.update({
      where: { id: group_id },
      data: {
        is_archived: false,
        archived_at: null,
      },
      include: PRISMA_GROUP_INCLUDES,
    });

    // create audit record for group unarchival
    const builder = new AuditBuilder(tx, { actor_id });
    await builder
      .setTarget(audit.TARGET_TYPE.GROUP, group_id, updatedGroup.name)
      .create(tx, audit.AUTH_EVENT_TYPE.GROUP_UNARCHIVED);
    return updatedGroup;
  });
}

/**
 * List effective members of a group with pagination
 * @param {string} group_id - ID of the group
 * @param {Object} options - Pagination parameters
 * @param {string} options.search_term - Optional search term to filter members by name or email
 * @param {string} options.membership_type - 'all' for all members, 'direct' for direct members only, 'transitive' for transitive members only
 * @param {number} options.limit - Number of members to return
 * @param {number} options.offset - Number of members to skip
 * @param {boolean} options.only_enabled_users - Whether to include only enabled users in the list
 * @returns {Promise<Object>} Paginated list of group members with metadata
 */
async function listGroupMembers(group_id, {
  search_term,
  membership_type,
  only_enabled_users = false,
  limit,
  offset,
}) {
  const search_term_trimmed = (search_term || '')?.trim();
  let searchClause = Prisma.empty;
  if (search_term_trimmed) {
    const likeTerm = sqlUtils.createLikePattern(search_term_trimmed);
    searchClause = Prisma.sql`(
      u.name ILIKE ${likeTerm} 
      OR u.email ILIKE ${likeTerm} 
      OR u.username ILIKE ${likeTerm} 
    )`;
  }

  const groupIdFilterClause = Prisma.sql`gc.ancestor_id = ${group_id}`;
  const enabledUsersClause = only_enabled_users ? Prisma.sql`u.is_deleted = false` : Prisma.empty;
  let membershipTypeClause = Prisma.empty;
  if (membership_type === 'direct') {
    membershipTypeClause = Prisma.sql`gc.depth = 0`;
  } else if (membership_type === 'transitive') {
    membershipTypeClause = Prisma.sql`gc.depth > 0`;
  }
  const whereClause = sqlUtils.buildWhereClause(
    [groupIdFilterClause, enabledUsersClause, membershipTypeClause, searchClause],
    ' AND ',
  );

  return prisma.$transaction(async (tx) => {
    // Step 1: Get membership IDs with effective roles using raw SQL

    // deduplication logic:
    // if a user has multiple membership paths to the group, prefer:
    // 1) lowest depth (shortest path to group) - direct membership over transitive membership
    // 2) Otherwise prefer higher role (admin > member), in enum order: member = 0, admin = 1, so order by role desc
    // 3) Otherwise prefer older assignment

    // presentation ordering logic:
    // 1) order by depth asc to show direct members first, then transitive members
    // 2) then order by group name, so that members are grouped by group name within each depth level
    // 3) then order by role desc to show admins before members within each group
    // 4) then order by user name to have a consistent order for members with same role within same group
    const sql = Prisma.sql`
      select * from (
        select distinct on (gu.user_id)
          g.name as membership_group_name, 
          g.id as membership_group_id, 
          gc.depth, gu."role", gu.user_id, gu.assigned_at, gu.assigned_by,
          u.name as user_name
        from group_closure gc 
        join "group" g on g.id = gc.descendant_id
        join active_group_user gu on gu.group_id = gc.descendant_id
        join "user" u on u.subject_id = gu.user_id
        ${whereClause}
        order by gu.user_id, gc.depth asc, gu."role" desc, gu.assigned_at asc
      ) t
      order by depth, membership_group_name, "role" desc, user_name ASC
      limit ${limit} offset ${offset}
    `;

    // console.log(sql.sql, sql.values); // log the generated SQL for debugging

    const membershipData = await tx.$queryRaw(sql);

    // Step 2: Extract user and assignor IDs
    const userSubjectIds = membershipData.map((m) => m.user_id);
    const assignorSubjectIds = membershipData
      .filter((m) => m.depth === 0) // assignor data only for direct members
      .map((m) => m.assigned_by)
      .filter(Boolean);
    // merge and deduplicate user and assignor IDs to minimize number of queries
    const subjectIdsToFetch = Array.from(new Set([...userSubjectIds, ...assignorSubjectIds]));

    // Step 3: Fetch user and assignor details in parallel
    const users = await tx.user.findMany({
      where: { subject_id: { in: subjectIdsToFetch } },
      select: {
        id: true,
        subject_id: true,
        name: true,
        email: true,
        username: true,
        is_deleted: true,
      },
    });

    // Step 4: Create lookup maps
    const userMap = new Map(users.map((u) => [u.subject_id, u]));

    // Step 5: Merge results
    const sanitizedMembers = membershipData.map((membership) => ({
      user_id: membership.user_id,
      user: userMap.get(membership.user_id),
      assignor: userMap.get(membership.assigned_by),
      assigned_at: membership.assigned_at,
      role: membership.role,
      effective_role: membership.depth === 0 ? membership.role : 'TRANSITIVE_MEMBER',
      depth: membership.depth,
      membership_via: {
        type: membership.depth === 0 ? 'DIRECT' : 'TRANSITIVE',
        name: membership.membership_group_name,
        id: membership.membership_group_id,
      },
    }));

    // Step 6: Get total count for pagination
    const totalRows = await tx.$queryRaw`
      SELECT count(distinct gu.user_id) as count
      FROM active_group_user gu
      JOIN group_closure gc ON gc.descendant_id = gu.group_id
      JOIN "user" u on u.subject_id = gu.user_id
      ${whereClause}
    `;
    const total = Number(totalRows[0].count);

    // Step 7: get direct members count for metadata
    const directMembershipCount = await tx.active_group_user.count({ where: { group_id } });

    return {
      metadata: {
        total,
        direct_membership: directMembershipCount,
        limit,
        offset,
      },
      data: sanitizedMembers,
    };
  });
}

const LAST_ADMIN_MESSAGE = 'Cannot remove the only admin from the group.'
  + ' Please promote another member to admin before removing this member.';

/**
 * Refuses a membership change that would leave a group with no admin.
 *
 * Runs inside the caller's transaction after the group row is locked, so two removals in one
 * call, or in two concurrent calls, see each other. It used to run in the route before the
 * transaction and ask "is this user the only admin" once per user against the state before
 * any removal, so removing both of two admins in one call passed both checks.
 *
 * An admin is an active membership, read from `active_group_user`, of an account that is not
 * deleted. That is the definition `getGroupsWithoutActiveAdmins` reports on. A change that
 * touches no current admin is never refused, even in a group that already has none.
 *
 * @param {Object} tx - Prisma transaction holding the group row lock
 * @param {string} group_id
 * @param {string[]} leaving_user_ids - users whose admin standing the change ends
 * @see docs/design/groups/access-model.md — Derived relations
 */
async function assertAdminsRemain(tx, group_id, leaving_user_ids) {
  const [counts] = await tx.$queryRaw`
    SELECT
      count(*) FILTER (WHERE gu.user_id = ANY(${leaving_user_ids}::text[])) AS leaving,
      count(*) FILTER (WHERE NOT (gu.user_id = ANY(${leaving_user_ids}::text[]))) AS remaining
    FROM active_group_user gu
    JOIN "user" u ON u.subject_id = gu.user_id
    WHERE gu.group_id = ${group_id}
      AND gu.role = ${sqlUtils.enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
      AND u.is_deleted = false
  `;
  if (Number(counts.leaving) > 0 && Number(counts.remaining) === 0) {
    throw createError.Conflict(LAST_ADMIN_MESSAGE);
  }
}

/**
 * Remove users from a group
 * @param {string} group_id
 * @param {Array<string>} data.user_ids - UUIDs of the users to remove
 * @param {string} data.actor_id - UUID of the admin performing the action
 * @returns {Promise<boolean>} Whether a membership was deleted
 */
async function removeGroupMembers(group_id, {
  user_ids, actor_id,
}) {
  return prisma.$transaction(async (tx) => {
    // lock the group row to prevent concurrent modifications (e.g. adding members) while we're modifying memberships
    // The group must exist, and its state must admit a membership change.
    assertPossible('remove_member', await lockGroup(tx, group_id));

    await assertAdminsRemain(tx, group_id, user_ids);

    // Close the membership rather than deleting it, so that "who was a member on date X?"
    // stays answerable. Re-adding the user later opens a new row.
    // @see docs/design/groups/decisions.md — 1. Membership and collection history are preserved
    const deletedRecords = await tx.$queryRaw`
      UPDATE group_user
      SET removed_at = CURRENT_TIMESTAMP, removed_by = ${actor_id}
      WHERE group_id = ${group_id}
      AND user_id = ANY(${user_ids}::text[])
      AND removed_at IS NULL
      RETURNING user_id;
    `;
    const deletedUserIds = deletedRecords.map((record) => record.user_id);

    // create audit records for removing group members
    const groupName = await resolveEntityName(tx, 'group', group_id);
    await createMembershipAuditRecords(tx, {
      eventType: audit.AUTH_EVENT_TYPE.GROUP_MEMBER_REMOVED,
      actor_id,
      user_ids: deletedUserIds,
      group_id,
      groupName,
      role: GROUP_MEMBER_ROLE.MEMBER,
    });

    return deletedUserIds;
  });
}

/**
 * Bulk add members to a group
 * @param {string} group_id
 * @param {Object} data
 * @param {Array<{user_id: string}>} data.user_ids - UUIDs of users to add as members
 * @param {string} data.actor_id - UUID of the admin performing the action
 * @returns {Promise<void>}
 */
async function addGroupMembers(group_id, { user_ids, actor_id }) {
  return prisma.$transaction(async (tx) => {
    assertNotSystemPrincipal(group_id, 'member');
    assertPossible('add_member', await lockGroup(tx, group_id));

    const createdRecords = await tx.$queryRaw`
      INSERT INTO group_user (group_id, user_id, role)
      SELECT ${group_id}, u.subject_id, ${sqlUtils.enumToSql(GROUP_MEMBER_ROLE.MEMBER)}
      FROM "user" u
      WHERE u.subject_id = ANY(${user_ids}::text[])
      ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING
      RETURNING user_id;
    `;
    const createdUserIds = createdRecords.map((record) => record.user_id);

    // create audit record for adding group members
    const groupName = await resolveEntityName(tx, 'group', group_id);
    await createMembershipAuditRecords(tx, {
      eventType: audit.AUTH_EVENT_TYPE.GROUP_MEMBER_ADDED,
      actor_id,
      user_ids: createdUserIds,
      group_id,
      groupName,
      role: GROUP_MEMBER_ROLE.MEMBER,
    });
  });
}

/**
 * Promote a group member to admin role
 * @param {string} group_id
 * @param {Object} data
 * @param {string} data.user_id - UUID of the user to promote
 * @param {string} data.actor_id - UUID of the admin performing the action
 * @returns {Promise<Object>} Updated membership object
 * @throws {createError.Conflict} If the user is not a member of the group
 */
async function promoteGroupMemberToAdmin(group_id, {
  user_id, actor_id,
}) {
  return prisma.$transaction(async (tx) => {
    assertPossible('edit_member_role', await lockGroup(tx, group_id));

    const membership = await tx.active_group_user.findFirst({ where: { group_id, user_id } });

    if (!membership) {
      throw createError.Conflict('User is not a member of the group.');
    }
    if (membership.role === GROUP_MEMBER_ROLE.ADMIN) {
      return membership;
    }

    const updatedMembership = await tx.group_user.update({
      where: { id: membership.id },
      data: {
        role: GROUP_MEMBER_ROLE.ADMIN,
      },
    });

    // create audit record for promoting group member to admin
    const groupName = await resolveEntityName(tx, 'group', group_id);
    await createMembershipAuditRecords(tx, {
      eventType: audit.AUTH_EVENT_TYPE.GROUP_ADMIN_ADDED,
      actor_id,
      user_ids: [user_id],
      group_id,
      groupName,
      role: GROUP_MEMBER_ROLE.ADMIN,
    });
    return updatedMembership;
  });
}

/**
 * Remove admin role from a group member
 * @param {string} group_id
 * @param {Object} data
 * @param {string} data.user_id - UUID of the user to demote
 * @param {string} data.actor_id - UUID of the admin performing the action
 * @returns {Promise<Object>} Updated membership object
 * @throws {createError.Conflict} If the user is not a member of the group
 */
async function demoteAdminToMember(group_id, {
  user_id, actor_id,
}) {
  return prisma.$transaction(async (tx) => {
    // Lock the group row first, as removal does, so a demotion and a removal of the other
    // admin cannot both pass the last-admin check.
    assertPossible('edit_member_role', await lockGroup(tx, group_id));

    const membership = await tx.active_group_user.findFirst({ where: { group_id, user_id } });

    if (!membership) {
      throw createError.Conflict('User is not a member of the group.');
    }
    if (membership.role === GROUP_MEMBER_ROLE.MEMBER) {
      return membership;
    }

    await assertAdminsRemain(tx, group_id, [user_id]);

    const updatedMembership = await tx.group_user.update({
      where: { id: membership.id },
      data: {
        role: GROUP_MEMBER_ROLE.MEMBER,
      },
    });

    // create audit record for demoting group admin to member
    const groupName = await resolveEntityName(tx, 'group', group_id);
    await createMembershipAuditRecords(tx, {
      eventType: audit.AUTH_EVENT_TYPE.GROUP_ADMIN_REMOVED,
      actor_id,
      user_ids: [user_id],
      group_id,
      groupName,
      role: GROUP_MEMBER_ROLE.MEMBER,
    });
    return updatedMembership;
  });
}

/**
 * Search all groups with optional filters and pagination
 * @param {string} [group_id] - Optional group ID to filter by
 * @param {string} [search_term] - Optional search term to filter groups by name, tagline, description, or slug
 * @param {string} sort_by - Field to sort by (e.g. 'name', 'created_at')
 * @param {string} sort_order - Sort order ('asc' or 'desc')
 * @param {number} limit - Number of results to return
 * @param {number} offset - Pagination offset
 * @param {boolean|null} is_archived - Optional filter to include only archived (true), only non-archived (false), or all (null) groups
 * @param {string} scope - Scope of the search ('all', 'direct', 'oversight', 'admin')
 * @returns {Promise<Object>} An object containing metadata about the search results and an array of matching groups
 */
async function searchGroupsForUser({
  user_id,
  group_id = null,
  search_term = null,
  sort_by,
  sort_order,
  limit,
  offset,
  is_archived = null,
  scope = 'all',
}) {
  let searchClause = Prisma.empty;
  if (search_term) {
    searchClause = Prisma.sql`(
      g.name ILIKE ${`%${search_term}%`} OR
      g.description ILIKE ${`%${search_term}%`} OR
      g.tagline ILIKE ${`%${search_term}%`} OR
      g.slug ILIKE ${`%${search_term}%`}
    )`;
  }
  let idFilterClause = Prisma.empty;
  if (group_id) {
    idFilterClause = Prisma.sql`g.id = ${group_id}`;
  }

  let archivedClause = Prisma.empty;
  if (is_archived !== null) {
    archivedClause = Prisma.sql`g.is_archived = ${is_archived}`;
  }

  // Visibility is any path to the group, including a grant on a resource it owns, which the
  // group page admits too. `admin` and `direct` filter on the caller's own membership row.
  // @see src/authorization/builtin/paths
  let membershipClause = Prisma.empty;
  if (scope === 'admin') {
    membershipClause = Prisma.sql`
        gu.role = ${sqlUtils.enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
      `;
  } else if (scope === 'direct') {
    membershipClause = Prisma.sql`
        gu.role IS NOT NULL
      `;
  } else if (scope === 'oversight') {
    membershipClause = Prisma.sql`
      p.oversight
    `;
  } else if (scope === 'all') {
    membershipClause = Prisma.sql`
    p.id IS NOT NULL
  `;
  }

  const finalWhereClause = sqlUtils.buildWhereClause(
    [searchClause, idFilterClause, archivedClause, membershipClause],
    ' AND ',
  );

  const dataSql = Prisma.sql`
    WITH paths AS (
      SELECT ap.resource_id AS id,
        bool_or(ap.path_kind = 'oversight') AS oversight
      FROM (${accessPathsQuery({ userId: user_id, resourceType: 'group' })}) ap
      GROUP BY ap.resource_id
    )
    SELECT 
      g.*, 
      ( select count(*) from active_group_user where group_id = g.id ) as size,
      ( select count(*)-1 from group_closure gc where gc.descendant_id = g.id ) as depth -- for sorting
    FROM "group" g
    -- 1-on-1 join because of unique constraint on (group_id, user_id)
    LEFT JOIN active_group_user gu ON gu.group_id = g.id AND gu.user_id = ${user_id}
    LEFT JOIN paths p ON p.id = g.id -- 1-on-1 join because the CTE groups by id
    ${finalWhereClause}
    ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
    LIMIT ${limit} OFFSET ${offset}
  `;

  // console.log(dataSql.sql, dataSql.values); // log the generated SQL for debugging

  const countSql = Prisma.sql`
    WITH paths AS (
      SELECT ap.resource_id AS id,
        bool_or(ap.path_kind = 'oversight') AS oversight
      FROM (${accessPathsQuery({ userId: user_id, resourceType: 'group' })}) ap
      GROUP BY ap.resource_id
    )
    SELECT COUNT(DISTINCT g.id) as total_count
    FROM "group" g
    LEFT JOIN active_group_user gu ON gu.group_id = g.id AND gu.user_id = ${user_id}
    LEFT JOIN paths p ON p.id = g.id
    ${finalWhereClause}
  `;

  const [results, countResult] = await Promise.all([prisma.$queryRaw(dataSql), prisma.$queryRaw(countSql)]);
  const total = Number(countResult[0].total_count);

  return {
    metadata: {
      total,
      limit,
      offset,
    },
    data: results
      .map(({ size, depth, ...group }) => ({
        ...group,
        _count: { members: Number(size) },
        depth: Number(depth),
      })),
  };
}

/**
 * Search groups that a user is a member of with optional filters and pagination
 * @param {string} user_id - ID of the user to search groups for
 * @param {string} [group_id] - Optional group ID to filter by
 * @param {string} [search_term] - Optional search term to filter groups by name, tagline, description, or slug
 * @param {string} sort_by - Field to sort by (e.g. 'name', 'created_at')
 * @param {string} sort_order - Sort order ('asc' or 'desc')
 * @param {number} limit - Number of results to return
 * @param {number} offset - Pagination offset
 * @param {boolean|null} is_archived - Optional filter to include only archived (true), only non-archived (false), or all (null) groups
 * @param {string} scope - direct | oversight | admin | all
 * @returns {Promise<Object>} An object containing metadata about the search results and an array of matching groups
 */
async function searchAllGroups({
  user_id,
  group_id = null,
  search_term = null,
  sort_by,
  sort_order,
  limit,
  offset,
  is_archived = null,
  scope = 'all',
}) {
  let searchClause = Prisma.empty;
  if (search_term) {
    searchClause = Prisma.sql`(
      g.name ILIKE ${`%${search_term}%`} OR
      g.description ILIKE ${`%${search_term}%`} OR
      g.tagline ILIKE ${`%${search_term}%`} OR
      g.slug ILIKE ${`%${search_term}%`}
    )`;
  }
  let idFilterClause = Prisma.empty;
  if (group_id) {
    idFilterClause = Prisma.sql`g.id = ${group_id}`;
  }

  let archivedClause = Prisma.empty;
  if (is_archived !== null) {
    archivedClause = Prisma.sql`g.is_archived = ${is_archived}`;
  }

  let membershipClause = Prisma.empty;
  if (scope === 'admin') {
    membershipClause = Prisma.sql`
        gu.role = ${sqlUtils.enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
      `;
  } else if (scope === 'direct') {
    membershipClause = Prisma.sql`
        gu.role IS NOT NULL
      `;
  } else if (scope === 'oversight') {
    // only show groups user administers
    membershipClause = Prisma.sql`
      og.id IS NOT NULL
    `;
  }

  // The system principals are grant subjects, not groups anybody joins or manages, so they
  // never appear in a group listing. Excluded by id rather than slug, because a rename
  // would silently put them back.
  // @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
  const excludeSystemPrincipalsClause = Prisma.sql`g.id NOT IN (${Prisma.join(SYSTEM_PRINCIPAL_GROUP_IDS)})`;

  const finalWhereClause = sqlUtils.buildWhereClause(
    [searchClause, idFilterClause, archivedClause, membershipClause, excludeSystemPrincipalsClause],
    ' AND ',
  );

  // Groups they are members of
  // Parent groups of those groups
  // if admin of any group, also show all descendant groups for oversight purposes
  const dataSql = Prisma.sql`
      WITH oversight_groups AS (
        SELECT DISTINCT group_id AS id
        FROM effective_user_oversight_groups
        WHERE user_id = ${user_id}
      )
      SELECT 
        g.*,
        ( select count(*) from active_group_user where group_id = g.id ) as size,
        ( select count(*)-1 from group_closure gc where gc.descendant_id = g.id ) as depth -- for sorting
      FROM "group" g
      LEFT JOIN active_group_user gu ON gu.group_id = g.id AND gu.user_id = ${user_id}
      LEFT JOIN oversight_groups og ON og.id = g.id
      ${finalWhereClause}
      ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
      LIMIT ${limit} OFFSET ${offset}
  `;

  const countSql = Prisma.sql`
    WITH oversight_groups AS (
      SELECT DISTINCT group_id AS id
      FROM effective_user_oversight_groups
      WHERE user_id = ${user_id}
    )
    SELECT COUNT(DISTINCT g.id) as total_count
    FROM "group" g
    LEFT JOIN active_group_user gu ON gu.group_id = g.id AND gu.user_id = ${user_id}
    LEFT JOIN oversight_groups og ON og.id = g.id
    ${finalWhereClause}
  `;

  const [results, countResults] = await Promise.all([
    prisma.$queryRaw(dataSql),
    prisma.$queryRaw(countSql),
  ]);
  const total = Number(countResults.length > 0 ? countResults[0].total_count : 0);
  return {
    metadata: {
      total,
      limit,
      offset,
    },
    data: results
      .map(({ size, depth, ...group }) => ({
        ...group,
        _count: { members: Number(size) },
        depth: Number(depth),
      })),
  };
}

/**
 * Get ancestor groups of a group with depth information
 * @param {string} group_id - ID of the group to get ancestors for
 * @returns {Promise<Array<{id: string, name: string, slug: string, depth: number}>>} List of ancestor groups with depth
 */
async function getGroupAncestors(group_id) {
  const ancestors = await prisma.group_closure.findMany({
    where: { descendant_id: group_id, depth: { gt: 0 } },
    include: {
      ancestor: true,
    },
    orderBy: {
      depth: 'asc',
    },
  });
  return ancestors.map(({ depth, ancestor }) => ({ depth, ...ancestor }));
}

/**
 * Get descendant groups of a group with depth information
 * @param {string} group_id - ID of the group to get descendants for
 * @param {Object} options - Optional filters
 * @param {boolean|null} options.archived - Optional filter to include only archived (true), only non-archived (false), or all (null) descendant groups
 * @param {number} options.max_depth - Maximum depth of descendant groups to include (e.g. max_depth=1 to include only direct children)
 * @param {string} search_term - Optional search term to filter descendant groups by name, tagline, description, or slug
 * @returns {Promise<Array<{id: string, name: string, slug: string, depth: number}>>} List of descendant groups with depth
 */
async function getGroupDescendants(group_id, opts = {}) {
  const where = {
    ancestor_id: group_id,
    depth: {
      gt: 0,
    },
  };
  if (opts.is_archived != null) {
    where.descendant = {
      is_archived: opts.is_archived,
    };
  }
  if (opts.max_depth != null) {
    where.depth = {
      gt: 0,
      lte: opts.max_depth,
    };
  }
  if (opts.search_term) {
    where.descendant = {
      OR: [
        { name: { contains: opts.search_term, mode: 'insensitive' } },
        { description: { contains: opts.search_term, mode: 'insensitive' } },
        { tagline: { contains: opts.search_term, mode: 'insensitive' } },
        { slug: { contains: opts.search_term, mode: 'insensitive' } },
      ],
    };
  }
  const descendants = await prisma.group_closure.findMany({
    where,
    include: {
      descendant: true,
    },
    orderBy: {
      depth: 'asc',
    },
  });
  return descendants.map(({ depth, descendant }) => ({ depth, ...descendant }));
}

/**
 * Get a hierarchical (nested) representation of groups.
 *
 * This is a convenience helper that returns groups in a parent/children tree
 * structure, with an optional filter on archived status or simple text search.
 *
 * @param {Object} options
 * @param {boolean|null} options.is_archived - Filter by archived status. Null returns all.
 * @param {string|null} options.search_term - Optional search term to filter groups by name/slug/tagline/description.
 * @param {number} options.root_limit - Max number of root groups to return.
 * @param {number} options.root_offset - Offset for root group pagination.
 * @returns {Promise<Array<Object>>} Array of group objects with an `_children` array.
 */
async function getGroupHierarchy({
  is_archived = null,
  search_term = null,
  root_limit = 10,
  root_offset = 0,
} = {}) {
  const where = {};
  if (is_archived != null) {
    where.is_archived = is_archived;
  }
  if (search_term) {
    where.OR = [
      { name: { contains: search_term, mode: 'insensitive' } },
      { slug: { contains: search_term, mode: 'insensitive' } },
      { description: { contains: search_term, mode: 'insensitive' } },
      { tagline: { contains: search_term, mode: 'insensitive' } },
    ];
  }

  // fetch all groups matching the filter criteria
  const groups = await prisma.group.findMany({
    where,
    include: {
      _count: {
        select: {
          members: true,
          owned_datasets: true,
          owned_collections: true,
        },
      },
    },
  });

  // build a map of group_id to group object for easy lookup, and an array of group IDs for querying closure table
  const groupIds = groups.map((g) => g.id);
  const groupMap = new Map(groups.map((g) => [g.id, { ...g, _children: [] }]));

  if (groupIds.length === 0) {
    return [];
  }

  // fetch all closure edges between the groups to determine parent-child relationships
  const closureEdges = await prisma.group_closure.findMany({
    where: {
      ancestor_id: { in: groupIds },
      descendant_id: { in: groupIds },
      depth: 1,
    },
    select: {
      ancestor_id: true,
      descendant_id: true,
    },
  });

  // keep track of which groups are children to identify root groups later
  const childIds = new Set();
  // build the tree by linking parents to children based on the closure edges
  for (const edge of closureEdges) {
    // for each parent-child edge, find the corresponding group objects and link them in the tree
    // this works because JS Map stores references to the original group objects,
    // so modifying the parent._children array modifies the original object in the map
    const parent = groupMap.get(edge.ancestor_id);
    const child = groupMap.get(edge.descendant_id);
    if (parent && child) {
      parent._children.push(child);
      childIds.add(edge.descendant_id);
    }
  }

  // the root groups are those that are never a child in any closure edge (i.e. their ID never appears as a descendant_id)
  const roots = groups
    .filter((g) => !childIds.has(g.id))
    .map((g) => groupMap.get(g.id));

  // apply pagination to the root groups; children are not paginated and will all be returned for each root
  return roots.slice(root_offset, root_offset + root_limit);
}

/**
 * Get groups that do not have no admins or any active admins
 * @returns {Promise<Array<Object>>} List of groups without active admins, including counts of members, owned datasets, and owned collections
 */
async function getGroupsWithoutActiveAdmins() {
  // From all non-archived groups, remove groups that have at least one active admin user.
  // An active admin user is defined as a user that is not deleted and has an admin role in the group.
  // The system principals are grant subjects, not groups anybody joins or manages, so
  // having no admin is their normal state rather than a gap to report. They are excluded
  // here for the same reason the group listing excludes them.
  // @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
  const rows = await prisma.$queryRaw`
    SELECT g.id
    FROM "group" g
    WHERE g.is_archived = false
      AND g.id NOT IN (${Prisma.join(SYSTEM_PRINCIPAL_GROUP_IDS)})
      AND NOT EXISTS (
        SELECT 1
        FROM active_group_user gu
        JOIN "user" u ON u.subject_id = gu.user_id
        WHERE gu.group_id = g.id
          AND gu.role = ${sqlUtils.enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
          AND u.is_deleted = false
      )
  `;
  const groupIds = rows.map((row) => row.id);
  return prisma.group.findMany({
    where: { id: { in: groupIds } },
    include: {
      _count: {
        select: {
          members: true,
          owned_datasets: true,
          owned_collections: true,
        },
      },
    },
  });
}

/**
 * How many groups a user administers and how many they oversee, from the membership views.
 *
 * Oversight is a strict descendant of a group the user administers, so a group can count in
 * both. The dashboard and the list pages read these facts to choose what to offer; no decision
 * reads them.
 *
 * @param {string} user_id - subject id
 * @returns {Promise<{admin_group_count: number, oversight_group_count: number}>}
 * @see docs/design/groups/access-model.md — The UI consumption contract
 */
async function governanceCounts(user_id) {
  const [row] = await prisma.$queryRaw(Prisma.sql`
    SELECT
      (SELECT COUNT(DISTINCT group_id) FROM active_group_user
        WHERE user_id = ${user_id} AND role = ${sqlUtils.enumToSql(GROUP_MEMBER_ROLE.ADMIN)}) AS admin_group_count,
      (SELECT COUNT(DISTINCT group_id) FROM effective_user_oversight_groups
        WHERE user_id = ${user_id}) AS oversight_group_count
  `);
  return {
    admin_group_count: Number(row.admin_group_count),
    oversight_group_count: Number(row.oversight_group_count),
  };
}

module.exports = {
  governanceCounts,
  createGroup,
  getGroupById,
  getGroupBySlug,
  updateGroupMetadata,
  archiveGroup,
  unarchiveGroup,
  listGroupMembers,
  removeGroupMembers,
  addGroupMembers,
  promoteGroupMemberToAdmin,
  demoteAdminToMember,
  getAncestorGroups,
  getDescendantGroups,
  getGroupHierarchy,
  searchAllGroups,
  searchGroupsForUser,
  getGroupAncestors,
  getGroupDescendants,
  getGroupsWithoutActiveAdmins,
};

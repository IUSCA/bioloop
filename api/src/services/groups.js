const { Prisma, GROUP_MEMBER_ROLE } = require('@prisma/client');
const _ = require('lodash/fp');
const createError = require('http-errors');
const { randomUUID } = require('crypto');

const prisma = require('@/db');

const { generate_slug } = require('@/utils/slug');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const sqlUtils = require('@/utils/sql');
const assert = require('assert');

const PRISMA_GROUP_INCLUDES = {};

// eslint-disable-next-line max-len
const CONFLICT_ERROR_MESSAGE = 'Failed to update group metadata due to concurrent modification. Please refresh and try again.';
const ARCHIVED_ERROR_MESSAGE = 'Cannot modify an archived group.';

async function _getGroup(by, value) {
  assert(by === 'id' || by === 'slug', 'Invalid "by" parameter');
  const group = await prisma.group.findUniqueOrThrow({
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
    },
  });
  const { ancestor_edges, members, ...groupData } = group;
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
 * Create a new group
 * @param {Object} data - Group creation data
 * @param {string} data.name - Group name (unique)
 * @param {string} [data.description] - Optional description
 * @param {boolean} [data.allow_user_contributions] - Whether users can upload
 * @param {Object} [data.metadata] - Additional metadata
 * @param {string} actor_id - UUID of the user creating the group
 * @returns {Promise<Object>} Created group with closure entries
 */
async function createGroup(data, actor_id) {
  return prisma.$transaction(async (tx) => {
    // create slug - URL-friendly identifier based on name, e.g. "My Group" -> "my-group"
    const slug = await generate_slug({
      name: data.name,
      is_slug_unique_fn: make_slug_unique_fn(tx),
    });

    const id = randomUUID();

    // subject row must be created first — group.id is a direct FK to subject.id
    await tx.subject.create({ data: { id, type: 'GROUP' } });

    // create group without any members
    const _group = await tx.group.create({
      data: {
        id,
        name: data.name,
        slug,
        description: data.description ?? Prisma.skip,
        allow_user_contributions: data.allow_user_contributions ?? Prisma.skip,
        metadata: data.metadata ?? Prisma.skip,
      },
      include: PRISMA_GROUP_INCLUDES,
    });

    // create closure entry for group being its own ancestor
    await tx.group_closure.create({
      data: {
        ancestor_id: _group.id,
        descendant_id: _group.id,
        depth: 0,
      },
    });

    // create audit record for group creation
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GROUP_CREATED,
        actor_id,
        target_type: 'group',
        target_id: _group.id,
      },
    });

    return _group;
  });
}

/**
 * Create a new child group under a parent group
 * @param {string} parent_id - ID of the parent group
 * @param {Object} data - Group creation data
 * @param {string} data.name - Group name (unique)
 * @param {string} [data.description] - Optional description
 * @param {boolean} [data.allow_user_contributions] - Whether users can upload
 * @param {Object} [data.metadata] - Additional metadata
 * @param {string} actor_id - UUID of the user creating the group
 * @returns {Promise<Object>} Created group with closure entries
 */
async function createChildGroup(parent_id, data, actor_id) {
  return prisma.$transaction(async (tx) => {
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
        description: data.description ?? Prisma.skip,
        allow_user_contributions: data.allow_user_contributions ?? Prisma.skip,
        metadata: data.metadata ?? Prisma.skip,
        members: {
          create: {
            user_id: actor_id,
            role: GROUP_MEMBER_ROLE.ADMIN,
          },
        },
      },
      include: PRISMA_GROUP_INCLUDES,
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
      {
        ancestor_id: parent_id,
        descendant_id: _group.id,
        depth: 1,
      },
    ];

    const ancestorGroups = await getAncestorGroups(tx, parent_id);
    const ancestorClosureEntries = ancestorGroups.map((ancestor) => ({
      ancestor_id: ancestor.id,
      descendant_id: _group.id,
      depth: ancestor.depth + 1,
    }));
    await tx.group_closure.createMany({
      data: [...closureEntries, ...ancestorClosureEntries],
    });

    // Since this is a new child group, it won't have any descendants yet,
    // so we don't need to create closure entries for descendant groups

    // create audit record for group creation
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GROUP_CREATED,
        actor_id,
        target_type: 'group',
        target_id: _group.id,
      },
    });

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
 * @param {string} params.actor_id - UUID of the user performing the update (for audit)
 * @param {number} params.expected_version - Expected current version for optimistic concurrency control
 * @returns {Promise<Object>} Updated group object
 * @throws {createError.Conflict} If the update fails due to concurrent modification
 */
async function updateGroupMetadata(group_id, { data, expected_version }) {
  return prisma.$transaction(async (tx) => {
    // check if name changed and if so, generate new slug
    let slug;
    const currentGroup = await tx.group.findUniqueOrThrow({
      where: { id: group_id },
    });

    // ensure group is not archived before allowing metadata updates
    if (currentGroup.is_archived) {
      throw createError.Conflict(ARCHIVED_ERROR_MESSAGE);
    }

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
      throw e;
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
    const updatedGroup = await tx.group.update({
      where: { id: group_id },
      data: {
        is_archived: true,
        archived_at: new Date(),
      },
      include: PRISMA_GROUP_INCLUDES,
    });

    // create audit record for group archival
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GROUP_ARCHIVED,
        actor_id,
        target_type: 'group',
        target_id: group_id,
      },
    });
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
    const updatedGroup = await tx.group.update({
      where: { id: group_id },
      data: {
        is_archived: false,
        archived_at: null,
      },
      include: PRISMA_GROUP_INCLUDES,
    });

    // create audit record for group unarchival
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GROUP_UNARCHIVED,
        actor_id,
        target_type: 'group',
        target_id: group_id,
      },
    });
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
  const enabledUsersClause = only_enabled_users ? Prisma.sql`u.is_disabled = false` : Prisma.empty;
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
        join group_user gu on gu.group_id = gc.descendant_id
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
      user: userMap.get(membership.user_id),
      assignor: userMap.get(membership.assigned_by),
      assigned_at: membership.assigned_at,
      role: membership.effective_role,
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
      FROM group_user gu
      JOIN group_closure gc ON gc.descendant_id = gu.group_id
      JOIN "user" u on u.subject_id = gu.user_id
      ${whereClause}
    `;
    const total = Number(totalRows[0].count);

    // Step 7: get direct members count for metadata
    const directMembershipCount = await tx.group_user.count({
      where: {
        group_id,
      },
    });

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
    const groupRecords = await tx.$queryRaw`
      SELECT is_archived
      FROM "group" g
      where g.id = ${group_id}
      FOR UPDATE;
    `;

    // validate group exists and is not archived before allowing membership removals
    if (groupRecords.length === 0) {
      throw createError.NotFound('Group not found');
    }
    if (groupRecords[0].is_archived) {
      throw createError.Conflict(ARCHIVED_ERROR_MESSAGE);
    }

    const deletedRecords = await tx.$queryRaw`
      DELETE FROM group_user
      WHERE group_id = ${group_id}
      AND user_id = ANY(${user_ids}::text[])
      RETURNING user_id;
    `;
    const deletedUserIds = deletedRecords.map((record) => record.user_id);

    // create audit records for removing group members
    await tx.authorization_audit.createMany({
      data: deletedUserIds.map((user_id) => ({
        event_type: AUTH_EVENT_TYPE.MEMBERSHIP_REMOVED,
        actor_id,
        target_type: 'group',
        target_id: group_id,
        metadata: {
          user_id,
        },
      })),
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
    const groupRows = await tx.$queryRaw`
      SELECT is_archived
      FROM "group" g
      where g.id = ${group_id}
      FOR UPDATE;
    `;
    if (groupRows.length === 0) {
      throw createError.NotFound('Group not found');
    }
    if (groupRows[0].is_archived) {
      throw createError.Conflict(ARCHIVED_ERROR_MESSAGE);
    }

    const createdRecords = await tx.$queryRaw`
      INSERT INTO group_user (group_id, user_id, role)
      SELECT ${group_id}, u.subject_id, ${sqlUtils.enumToSql(GROUP_MEMBER_ROLE.MEMBER)}
      FROM "user" u
      WHERE u.subject_id = ANY(${user_ids}::text[])
      ON CONFLICT (group_id, user_id) DO NOTHING
      RETURNING user_id;
    `;
    const createdUserIds = createdRecords.map((record) => record.user_id);

    // create audit record for adding group members
    await tx.authorization_audit.createMany({
      data: createdUserIds.map((user_id) => ({
        event_type: AUTH_EVENT_TYPE.MEMBERSHIP_ADDED,
        actor_id,
        target_type: 'group',
        target_id: group_id,
        metadata: {
          user_id,
          role: GROUP_MEMBER_ROLE.MEMBER,
        },
      })),
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
    const membership = await tx.group_user.findUnique({
      where: {
        group_id_user_id: {
          group_id,
          user_id,
        },
      },
    });

    if (!membership) {
      throw createError.Conflict('User is not a member of the group.');
    }
    if (membership.role === GROUP_MEMBER_ROLE.ADMIN) {
      return membership;
    }

    const updatedMembership = await tx.group_user.update({
      where: {
        group_id_user_id: {
          group_id,
          user_id,
        },
      },
      data: {
        role: GROUP_MEMBER_ROLE.ADMIN,
      },
    });

    // create audit record for promoting group member to admin
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.ADMIN_ADDED,
        actor_id,
        target_type: 'group',
        target_id: group_id,
        metadata: {
          user_id,
        },
      },
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
async function removeGroupAdmin(group_id, {
  user_id, actor_id,
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.group_user.findUnique({
      where: {
        group_id_user_id: {
          group_id,
          user_id,
        },
      },
    });

    if (!membership) {
      throw createError.Conflict('User is not a member of the group.');
    }
    if (membership.role === GROUP_MEMBER_ROLE.MEMBER) {
      return membership;
    }

    const updatedMembership = await tx.group_user.update({
      where: {
        group_id_user_id: {
          group_id,
          user_id,
        },
      },
      data: {
        role: GROUP_MEMBER_ROLE.MEMBER,
      },
    });

    // create audit record for demoting group admin to member
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.ADMIN_REMOVED,
        actor_id,
        target_type: 'group',
        target_id: group_id,
        metadata: {
          user_id,
        },
      },
    });
    return updatedMembership;
  });
}

/**
 * Search all groups with optional filters and pagination
 * @param {string} [group_id] - Optional group ID to filter by
 * @param {string} [search_term] - Optional search term to filter groups by name, description, or slug
 * @param {string} sort_by - Field to sort by (e.g. 'name', 'created_at')
 * @param {string} sort_order - Sort order ('asc' or 'desc')
 * @param {number} limit - Number of results to return
 * @param {number} offset - Pagination offset
 * @param {boolean|null} is_archived - Optional filter to include only archived (true), only non-archived (false), or all (null) groups
 * @param {boolean} direct_membership_only - If true, only return groups where the user is a direct member (not through nested group membership)
 * @param {boolean} oversight_only - If true, only return groups where the user has an admin role for oversight purposes
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
  direct_membership_only = false,
  oversight_only = false,
  admin_only = false,
}) {
  let searchClause = Prisma.empty;
  if (search_term) {
    searchClause = Prisma.sql`(
      g.name ILIKE ${`%${search_term}%`} OR
      g.description ILIKE ${`%${search_term}%`} OR
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
  if (direct_membership_only || admin_only) {
    // direct_membership_only or admin_only takes precedence, ignore oversight_only
    if (admin_only) {
      const admin_sql = Prisma.raw(GROUP_MEMBER_ROLE.ADMIN);
      membershipClause = Prisma.sql`
        gu.role = '${admin_sql}' AND gu.user_id = ${user_id}
      `;
    } else {
      membershipClause = Prisma.sql`
        gu.role IS NOT NULL AND gu.user_id = ${user_id}
      `;
    }
  } else if (oversight_only) {
    // only show groups user administers
    membershipClause = Prisma.sql`
      og.id IS NOT NULL
    `;
  } else {
    // default: show all groups and oversight groups
    membershipClause = Prisma.sql`
      (ag.id IS NOT NULL OR og.id IS NOT NULL)
    `;
  }

  const finalWhereClause = sqlUtils.buildWhereClause(
    [searchClause, idFilterClause, archivedClause, membershipClause],
    ' AND ',
  );

  const sql = Prisma.sql`
    WITH results AS (
      WITH all_groups AS (
        SELECT DISTINCT group_id AS id
        FROM effective_user_groups
        WHERE user_id = ${user_id}
      ),
      oversight_groups AS (
        SELECT DISTINCT group_id AS id
        FROM effective_user_oversight_groups
        WHERE user_id = ${user_id}
      )
      SELECT 
        g.*, 
        COALESCE(
          gu.role::text,
          CASE WHEN og.id IS NOT NULL THEN 'OVERSIGHT' END,
          'TRANSITIVE_MEMBER'
        ) AS user_role,
        ( select count(*) from group_user where group_id = g.id ) as size
      FROM "group" g
      LEFT JOIN group_user gu ON gu.group_id = g.id AND gu.user_id = ${user_id}
      LEFT JOIN oversight_groups og ON og.id = g.id
      LEFT JOIN all_groups ag ON ag.id = g.id
      ${finalWhereClause}
    )
    SELECT *, COUNT(*) OVER () AS total_count
    FROM results
    ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const results = await prisma.$queryRaw(sql);
  const total = Number(results.length > 0 ? results[0].total_count : 0);
  return {
    metadata: {
      total,
      limit,
      offset,
    },
    data: results.map(_.omit(['total_count'])),
  };
}

/**
 * Search groups that a user is a member of with optional filters and pagination
 * @param {string} user_id - ID of the user to search groups for
 * @param {string} [group_id] - Optional group ID to filter by
 * @param {string} [search_term] - Optional search term to filter groups by name, description, or slug
 * @param {string} sort_by - Field to sort by (e.g. 'name', 'created_at')
 * @param {string} sort_order - Sort order ('asc' or 'desc')
 * @param {number} limit - Number of results to return
 * @param {number} offset - Pagination offset
 * @param {boolean|null} is_archived - Optional filter to include only archived (true), only non-archived (false), or all (null) groups
 * @param {boolean} direct_membership_only - If true, only return groups where the user is a direct member (not through nested group membership)
 * @param {boolean} oversight_only - If true, only return groups where the user has an admin role for oversight purposes
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
  direct_membership_only = false,
  oversight_only = false,
  admin_only = false,
}) {
  let searchClause = Prisma.empty;
  if (search_term) {
    searchClause = Prisma.sql`(
      g.name ILIKE ${`%${search_term}%`} OR
      g.description ILIKE ${`%${search_term}%`} OR
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
  if (direct_membership_only || admin_only) {
    // direct_membership_only or admin_only takes precedence, ignore oversight_only
    if (admin_only) {
      const admin_sql = Prisma.raw(GROUP_MEMBER_ROLE.ADMIN);
      membershipClause = Prisma.sql`
        gu.role = '${admin_sql}'
      `;
    } else {
      membershipClause = Prisma.sql`
        gu.role IS NOT NULL
      `;
    }
  } else if (oversight_only) {
    // only show groups user administers
    membershipClause = Prisma.sql`
      og.id IS NOT NULL
    `;
  }

  const excludeEveryoneGroupClause = Prisma.sql`g.slug != 'everyone'`;

  const finalWhereClause = sqlUtils.buildWhereClause(
    [searchClause, idFilterClause, archivedClause, membershipClause, excludeEveryoneGroupClause],
    ' AND ',
  );

  // Groups they are members of
  // Parent groups of those groups
  // if admin of any group, also show all descendant groups for oversight purposes
  const sql = Prisma.sql`
    WITH results AS (
      WITH oversight_groups AS (
        SELECT DISTINCT group_id AS id
        FROM effective_user_oversight_groups
        WHERE user_id = ${user_id}
      )
      SELECT 
        g.*,
        COALESCE(
          gu.role::text,
          CASE WHEN og.id IS NOT NULL THEN 'OVERSIGHT' END
        ) AS user_role,
        ( select count(*) from group_user where group_id = g.id ) as size
      FROM "group" g
      LEFT JOIN group_user gu ON gu.group_id = g.id AND gu.user_id = ${user_id}
      LEFT JOIN oversight_groups og ON og.id = g.id
      ${finalWhereClause}
    )
    SELECT *, COUNT(*) OVER () AS total_count
    FROM results
    ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
    LIMIT ${limit} OFFSET ${offset}
  `;
  const results = await prisma.$queryRaw(sql);
  const total = Number(results.length > 0 ? results[0].total_count : 0);
  return {
    metadata: {
      total,
      limit,
      offset,
    },
    data: results.map(_.omit(['total_count'])),
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
 * @param {string} search_term - Optional search term to filter descendant groups by name, description, or slug
 * @returns {Promise<Array<{id: string, name: string, slug: string, depth: number}>>} List of descendant groups with depth
 */
async function getGroupDescendants(group_id, opts) {
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
 * Get groups that a user is a member of with optional filter for archived status
 * @param {string} user_id - ID of the user to get groups for
 * @param {boolean|null} archived - Optional filter to include only archived (true), only non-archived (false), or all (null) groups
 * @returns {Promise<Object>} An object containing metadata about the search results and an array of matching groups
 */
async function getMyGroups({ user_id, is_archived = null }) {
  // archived=true will return only archived groups
  // archived=false will return only active groups
  // archived not provided will return all groups regardless of archived status
  const where = {
    is_archived: is_archived ?? Prisma.skip,
    members: {
      some: {
        user_id,
      },
    },
  };
  const groups = await prisma.group.findMany({
    where,
    include: {
      ancestor_edges: true,
    },
  });
  const total = await prisma.group.count({
    where,
  });
  return {
    metadata: {
      total,
    },
    data: groups,
  };
}

module.exports = {
  createGroup,
  createChildGroup,
  getGroupById,
  getGroupBySlug,
  updateGroupMetadata,
  archiveGroup,
  unarchiveGroup,
  listGroupMembers,
  removeGroupMembers,
  addGroupMembers,
  promoteGroupMemberToAdmin,
  removeGroupAdmin,
  getAncestorGroups,
  getDescendantGroups,
  searchAllGroups,
  searchGroupsForUser,
  getGroupAncestors,
  getGroupDescendants,
  getMyGroups,
};

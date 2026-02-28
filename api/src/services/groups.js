const { Prisma } = require('@prisma/client');
const _ = require('lodash/fp');
const createError = require('http-errors');

const prisma = require('@/db');

const { generate_slug } = require('@/utils/slug');
const ConflictError = require('@/services/errors/ConflictError');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');

const PRISMA_GROUP_INCLUDES = {};
// eslint-disable-next-line max-len
const CONFLICT_ERROR_MESSAGE = 'Failed to update group metadata due to concurrent modification. Please refresh and try again.';
const ARCHIVED_ERROR_MESSAGE = 'Cannot modify an archived group.';

/**
 * Get group by ID
 * @param {string} group_id - ID of the group
 * @returns {Promise<Object>} Group object with members
 */
async function getGroupById(group_id) {
  return prisma.group.findUniqueOrThrow({
    where: { id: group_id },
    include: {
      ancestor_edges: true,
    },
  });
}

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
  return ancestors.map((entry) => entry.ancestor);
}

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
  return descendants.map((entry) => entry.descendant);
}

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
 * @param {number} actor_id - User creating the group
 * @returns {Promise<Object>} Created group with closure entries
 */
async function createGroup(data, actor_id) {
  return prisma.$transaction(async (tx) => {
    // create slug - URL-friendly identifier based on name, e.g. "My Group" -> "my-group"
    const slug = await generate_slug({
      name: data.name,
      is_slug_unique_fn: make_slug_unique_fn(tx),
    });

    // create group without any members
    const _group = await tx.group.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        allow_user_contributions: data.allow_user_contributions,
        metadata: data.metadata,
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
        action: 'create',
      },
    });

    return _group;
  });
}

/**
 * Create a new group
 * @param {string} parent_id - ID of the parent group
 * @param {Object} data - Group creation data
 * @param {string} data.name - Group name (unique)
 * @param {string} [data.description] - Optional description
 * @param {boolean} [data.allow_user_contributions] - Whether users can upload
 * @param {Object} [data.metadata] - Additional metadata
 * @param {number} actor_id - User creating the group
 * @returns {Promise<Object>} Created group with closure entries
 */
async function createChildGroup(parent_id, data, actor_id) {
  return prisma.$transaction(async (tx) => {
    // create slug - URL-friendly identifier based on name, e.g. "My Group" -> "my-group"
    const slug = await generate_slug({
      name: data.name,
      is_slug_unique_fn: make_slug_unique_fn(tx),
    });

    // create the new group
    const _group = await tx.group.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        allow_user_contributions: data.allow_user_contributions,
        metadata: data.metadata,
        members: {
          create: {
            user_id: actor_id,
            role: 'admin',
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
        action: 'create',
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
 * @param {number} params.actor_id - User performing the update (for audit)
 * @param {number} params.expected_version - Expected current version for optimistic concurrency control
 * @returns {Promise<Object>} Updated group object
 * @throws {ConflictError} If the update fails due to concurrent modification
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
      throw new ConflictError(ARCHIVED_ERROR_MESSAGE);
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
        throw new ConflictError(CONFLICT_ERROR_MESSAGE);
      }
      throw e;
    }

    return updatedGroup;
  });
}

/**
 * Archive a group
 * @param {string} group_id - ID of the group to archive
 * @param {number} actor_id - User performing the archival (for audit)
 * @returns {Promise<void>}
 */
async function archiveGroup(group_id, actor_id) {
  return prisma.$transaction(async (tx) => {
    await tx.group.update({
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
        action: 'update',
      },
    });
  });
}

/**
 * Unarchive a group
 * @param {string} group_id - ID of the group to unarchive
 * @param {number} actor_id - User performing the unarchival (for audit)
 * @returns {Promise<void>}
 */
async function unarchiveGroup(group_id, actor_id) {
  return prisma.$transaction(async (tx) => {
    await tx.group.update({
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
        action: 'update',
      },
    });
  });
}

/**
 * List members of a group with pagination
 * @param {string} group_id - ID of the group
 * @param {Object} pagination - Pagination parameters
 * @param {number} pagination.limit - Number of members to return
 * @param {number} pagination.offset - Number of members to skip
 * @returns {Promise<Object>} Paginated list of group members with metadata
 */
async function listGroupMembers(group_id, { limit, offset }) {
  return prisma.$transaction(async (tx) => {
    const members = await tx.group_user.findMany({
      where: { group_id },
      include: {
        user: true,
        assignor: true,
      },
      skip: offset,
      take: limit,
    });

    // total count for pagination
    const total = await tx.group_user.count({
      where: { group_id },
    });

    return {
      metadata: {
        total,
        limit,
        offset,
      },
      data: members,
    };
  });
}

/**
 * Remove users from a group
 * @param {string} group_id
 * @param {number} data.user_ids - ID of the user to remove
 * @param {number} data.actor_id - Admin performing the action
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
      throw new ConflictError(ARCHIVED_ERROR_MESSAGE);
    }

    const deletedRecords = await tx.$queryRaw`
      DELETE FROM group_user
      WHERE group_id = ${group_id}
      AND user_id = ANY(${user_ids})
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
        action: 'update',
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
 * @param {Array<{user_id: number}>} data.user_ids - IDs of users to add as members
 * @param {number} data.actor_id - Admin performing the action
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
      throw new ConflictError(ARCHIVED_ERROR_MESSAGE);
    }

    const createdRecords = await prisma.$queryRaw`
      INSERT INTO group_user (group_id, user_id, role)
      SELECT ${group_id}, u.id, 'MEMBER'
      FROM "user" u
      WHERE u.id = ANY(${user_ids})
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
        action: 'update',
        metadata: {
          user_id,
          role: 'MEMBER',
        },
      })),
    });
  });
}

/**
 * Promote a group member to admin role
 * @param {string} group_id
 * @param {Object} data
 * @param {number} data.user_id - ID of the user to promote
 * @param {number} data.actor_id - Admin performing the action
 * @returns {Promise<Object>} Updated membership object
 * @throws {ConflictError} If the user is not a member of the group
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
      throw new ConflictError('User is not a member of the group.');
    }
    if (membership.role === 'ADMIN') {
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
        role: 'ADMIN',
      },
    });

    // create audit record for promoting group member to admin
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.ADMIN_ADDED,
        actor_id,
        target_type: 'group',
        target_id: group_id,
        action: 'update',
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
 * @param {number} data.user_id - ID of the user to demote
 * @param {number} data.actor_id - Admin performing the action
 * @returns {Promise<Object>} Updated membership object
 * @throws {ConflictError} If the user is not a member of the group
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
      throw new ConflictError('User is not a member of the group.');
    }
    if (membership.role === 'MEMBER') {
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
        role: 'MEMBER',
      },
    });

    // create audit record for demoting group admin to member
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.ADMIN_REMOVED,
        actor_id,
        target_type: 'group',
        target_id: group_id,
        action: 'update',
        metadata: {
          user_id,
        },
      },
    });
    return updatedMembership;
  });
}

// search term
// - partial case-insensitive match on name or description or slug
// - or exact match on id
async function searchAllGroups({
  group_id = null,
  search_term = null,
  sort_by,
  sort_order,
  limit,
  offset,
  is_archived = null,
}) {
  const DEFAULT_SORT_BY = 'name';
  const DEFAULT_SORT_ORDER = 'asc';

  // build sorting
  const orderBy = {};
  if (sort_by) {
    orderBy[sort_by] = sort_order || DEFAULT_SORT_ORDER;
  } else {
    orderBy[DEFAULT_SORT_BY] = DEFAULT_SORT_ORDER;
  }

  // build where clause
  const where = {};
  if (group_id) {
    where.id = group_id;
  } else if (!search_term) {
    // if search_term is UUID, search by id
    where.OR = [
      {
        name: {
          contains: search_term,
          mode: 'insensitive',
        },
      },
      {
        description: {
          contains: search_term,
          mode: 'insensitive',
        },
      },
      {
        slug: {
          contains: search_term,
          mode: 'insensitive',
        },
      },
    ];
  }

  if (is_archived !== null) {
    where.is_archived = is_archived;
  }

  // if platform admin, scope to all groups
  const data = await prisma.group.findMany({
    where,
    orderBy,
    skip: offset,
    take: limit,
  });
  const total = await prisma.group.count({ where });

  return {
    metadata: {
      total,
      limit,
      offset,
    },
    data,
  };
}

// assume user_id, sort_by, sort_order, limit, offset are not null or undefined
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
}) {
  let searchClause = Prisma.empty;
  if (search_term) {
    searchClause = Prisma.sql`
    AND (
      g.name ILIKE ${`%${search_term}%`} OR
      g.description ILIKE ${`%${search_term}%`} OR
      g.slug ILIKE ${`%${search_term}%`}
    )
    `;
  }
  let idFilterClause = Prisma.empty;
  if (group_id) {
    idFilterClause = Prisma.sql`
      AND g.id = ${group_id}
    `;
  }

  let archivedClause = Prisma.empty;
  if (is_archived !== null) {
    archivedClause = Prisma.sql`
      AND g.is_archived = ${is_archived}
    `;
  }

  let membershipClause = Prisma.empty;
  if (direct_membership_only) {
    // direct_membership_only takes precedence, ignore oversight_only
    membershipClause = Prisma.sql`
      gu.role IS NOT NULL
    `;
  } else if (oversight_only) {
    // only show groups user administers
    membershipClause = Prisma.sql`
      g.id IN (SELECT id FROM oversight_groups)
    `;
  } else {
    // default: show all groups and oversight groups
    membershipClause = Prisma.sql`
      (g.id IN (SELECT id FROM all_groups) OR g.id IN (SELECT id FROM oversight_groups))
    `;
  }

  // Groups they are members of
  // Parent groups of those groups
  // if admin of any group, also show all descendant groups for oversight purposes
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
      SELECT g.*, gu.role as user_role
      FROM "group" g
      LEFT JOIN group_user gu ON gu.group_id = g.id
      WHERE 
      ${membershipClause}
      ${searchClause}
      ${idFilterClause}
      ${archivedClause}
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
    data: results,
  };
}

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

async function getGroupDescendants(group_id) {
  const descendants = await prisma.group_closure.findMany({
    where: { ancestor_id: group_id, depth: { gt: 0 } },
    include: {
      descendant: true,
    },
    orderBy: {
      depth: 'asc',
    },
  });
  return descendants.map(({ depth, descendant }) => ({ depth, ...descendant }));
}

async function getMyGroups({ user_id, archived = null }) {
  // archived=true will return only archived groups
  // archived=false will return only active groups
  // archived not provided will return all groups regardless of archived status
  const where = {
    is_archived: archived ?? Prisma.skip,
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

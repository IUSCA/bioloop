const prisma = require('@/db');
const { Prisma } = require('@prisma/client');

/**
 * Get all groups that a user has access to (direct membership + all descendant groups)
 *
 * This implements top-down hierarchical access. If group Child is a sub-group of a group Parent:
 * - if user is member of group Parent, they are also a member of group Child
 * - if user is member of group Child, they are not a member of group Parent
 *
 * @param {number} user_id - The ID of the user
 * @returns {Promise<Array>} Array of group IDs the user has access to
 */
async function get_user_accessible_groups(user_id) {
  /**
   * This query uses a recursive Common Table Expression (CTE) to build a list of all groups
   * that a user has access to. It starts with the groups the user is directly a member of
   * (base case) and then recursively adds all child groups (descendants, not ancestors).
   * The result is a list of all groups that a user has access to, including all child groups.
   */
  const groups = await prisma.$queryRaw`
    WITH RECURSIVE accessible_groups AS (
      -- Base case: groups user is directly a member of
      SELECT g.id, g.name, g.parent_id
      FROM "group" g
      INNER JOIN group_user gu ON g.id = gu.group_id
      WHERE gu.user_id = ${user_id}

      UNION

      -- Recursive case: groups user is a member of via a parent group
      SELECT g.id, g.name, g.parent_id
      FROM "group" g
      INNER JOIN accessible_groups ag ON g.parent_id = ag.id
    )
    SELECT DISTINCT id FROM accessible_groups;
  `;

  return groups.map((g) => g.id);
}

/**
 * Get group owner
 * @param {string} group_id - The group ID
 * @returns {Promise<Object>} The owner user
 */
async function get_group_owner({ group_id }) {
  const group = await prisma.group.findUniqueOrThrow({
    where: {
      id: group_id,
    },
    include: {
      owner: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  });
  return group.owner;
}

/**
 * Check if a user is a member of a group (direct membership only)
 * @param {string} group_id - The group ID
 * @param {number} user_id - The user ID
 * @returns {Promise<boolean>} True if user is direct member
 */
async function has_group_membership({ group_id, user_id }) {
  const membership = await prisma.group_user.findFirst({
    where: {
      group_id,
      user_id,
    },
  });
  return !!membership;
}

/**
 * Build include object for group queries
 * @param {Object} options - Options for what to include
 * @param {boolean} options.include_users - Include users
 * @param {boolean} options.include_projects - Include projects
 * @param {boolean} options.include_children - Include child groups
 * @param {boolean} options.include_parent - Include parent group
 * @returns {Object} Prisma include object
 */
function build_include_object({
  include_users = false,
  include_projects = false,
  include_children = false,
  include_parent = false,
} = {}) {
  return {
    ...(include_users && {
      users: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              email: true,
            },
          },
          assignor: {
            select: {
              id: true,
              username: true,
              name: true,
            },
          },
        },
      },
    }),
    ...(include_projects && {
      projects: {
        include: {
          project: {
            select: {
              id: true,
              slug: true,
              name: true,
              description: true,
            },
          },
          assignor: {
            select: {
              id: true,
              username: true,
              name: true,
            },
          },
        },
      },
    }),
    ...(include_children && {
      children: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    }),
    ...(include_parent && {
      parent: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    }),
    // owner: {
    //   select: {
    //     id: true,
    //     username: true,
    //     name: true,
    //   },
    // },
  };
}

/**
 * Create a new group
 * @param {Object} data - Group creation data
 * @param {string} data.name - Group name
 * @param {string} data.description - Group description
 * @param {string} data.parent_id - Parent group ID (for nested groups)
 * @param {number} data.owner_id - Owner user ID
 * @param {Array<number>} data.user_ids - User IDs to add to group
 * @param {Array<string>} data.project_ids - Project IDs to associate with group
 * @param {number} data.assignor_id - ID of user creating the group
 * @param {Object} include - What to include in response
 * @returns {Promise<Object>} Created group
 */
async function create_group({
  data,
  include = {},
}) {
  const {
    name, description, parent_id, owner_id, user_ids = [], project_ids = [], assignor_id, metadata,
  } = data;

  // Validate parent group exists if parent_id is provided
  if (parent_id) {
    await prisma.group.findUniqueOrThrow({
      where: { id: parent_id },
    });
  }

  const group = await prisma.group.create({
    data: {
      name,
      description,
      parent_id: parent_id || Prisma.skip,
      owner_id: owner_id || Prisma.skip,
      metadata: metadata || Prisma.skip,
      users: {
        create: user_ids.map((user_id) => ({
          user_id,
          assignor_id,
        })),
      },
      projects: {
        create: project_ids.map((project_id) => ({
          project_id,
          assignor_id,
        })),
      },
    },
    include: build_include_object(include),
  });

  return group;
}

module.exports = {
  get_user_accessible_groups,
  build_include_object,
  create_group,
  get_group_owner,
  has_group_membership,
};

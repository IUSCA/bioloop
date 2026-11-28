const { isFeatureEnabledForRole } = require('@/services/features');

function isNotificationsEnabledForRole(roleName) {
  return isFeatureEnabledForRole({ key: 'notifications', roleName });
}

/**
 * Builds a lexicographic sort key for deterministic role precedence.
 * Format: "rolename::roleid" — the lowest key wins when a user qualifies
 * through multiple role-broadcast targets.
 * @param {{ roleById: Object, roleId: number }} opts
 * @returns {string}
 */
function getRolePrecedenceKey({ roleById, roleId }) {
  const role = roleById[roleId];
  if (!role) return '';
  return `${String(role.name || '').toLowerCase()}::${String(role.id)}`;
}

/**
 * Determines whether a candidate delivery role should replace the
 * existing one for a recipient row, using lexicographic precedence.
 * @param {{ existingRoleId: number|null, candidateRoleId: number|null, roleById: Object }} opts
 * @returns {boolean}
 */
function shouldReplaceRoleRecipient({ existingRoleId, candidateRoleId, roleById }) {
  if (existingRoleId == null) return true;
  if (candidateRoleId == null) return false;
  const existingKey = getRolePrecedenceKey({ roleById, roleId: existingRoleId });
  const candidateKey = getRolePrecedenceKey({ roleById, roleId: candidateRoleId });
  return candidateKey < existingKey;
}

/**
 * Resolves the set of notification recipients from role-broadcast
 * and direct-user target lists. Returns one row per unique user.
 *
 * Precedence rules:
 * - A user targeted by multiple roles gets a single ROLE_BROADCAST row
 *   with the delivery_role_id of the highest-precedence (lexicographically
 *   smallest) role.
 * - A user listed in both roleIds and userIds gets a single DIRECT row
 *   (direct always overrides role-broadcast for the same user).
 * - Users whose roles are not enabled for the notifications feature are
 *   excluded entirely.
 *
 * Must run inside a Prisma transaction (the `tx` parameter) to guarantee
 * a consistent snapshot of roles/users during recipient resolution.
 *
 * @param {{ tx: import('@prisma/client').PrismaClient, roleIds?: number[], userIds?: number[] }} opts
 * @returns {Promise<Array<{ user_id: number, delivery_type: string, delivery_role_id: number|null }>>}
 */
async function resolveEligibleRecipients({
  tx, roleIds = [], userIds = [],
}) {
  const uniqRoleIds = Array.from(new Set(roleIds));
  const uniqUserIds = Array.from(new Set(userIds));

  const roleRows = uniqRoleIds.length > 0 ? await tx.role.findMany({
    where: { id: { in: uniqRoleIds } },
    select: { id: true, name: true },
  }) : [];
  const roleById = roleRows.reduce((acc, roleRow) => {
    acc[roleRow.id] = roleRow;
    return acc;
  }, {});

  const roleUserRows = uniqRoleIds.length > 0 ? await tx.user_role.findMany({
    where: {
      role_id: { in: uniqRoleIds },
    },
    select: {
      user_id: true,
      role_id: true,
    },
  }) : [];

  const allRequestedUserIds = Array.from(new Set([
    ...uniqUserIds,
    ...roleUserRows.map((row) => row.user_id),
  ]));
  const users = allRequestedUserIds.length > 0 ? await tx.user.findMany({
    where: {
      id: {
        in: allRequestedUserIds,
      },
    },
    include: {
      user_role: {
        select: {
          roles: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  }) : [];
  const userById = users.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});

  const recipientMap = new Map();
  roleUserRows.forEach((row) => {
    const user = userById[row.user_id];
    const role = roleById[row.role_id];
    if (!user || !role || !isNotificationsEnabledForRole(role.name)) return;
    const userRoles = user.user_role.map((ur) => ur.roles.name);
    const isUserEligible = userRoles.some((roleName) => isNotificationsEnabledForRole(roleName));
    if (!isUserEligible) return;

    const existing = recipientMap.get(row.user_id);
    if (!existing) {
      recipientMap.set(row.user_id, {
        user_id: row.user_id,
        delivery_type: 'ROLE_BROADCAST',
        delivery_role_id: row.role_id,
      });
      return;
    }

    if (
      existing.delivery_type === 'ROLE_BROADCAST'
      && shouldReplaceRoleRecipient({
        existingRoleId: existing.delivery_role_id,
        candidateRoleId: row.role_id,
        roleById,
      })
    ) {
      recipientMap.set(row.user_id, {
        ...existing,
        delivery_role_id: row.role_id,
      });
    }
  });

  uniqUserIds.forEach((id) => {
    const user = userById[id];
    if (!user) return;
    const userRoles = user.user_role.map((ur) => ur.roles.name);
    const isUserEligible = userRoles.some((roleName) => isNotificationsEnabledForRole(roleName));
    if (!isUserEligible) return;
    recipientMap.set(id, {
      user_id: id,
      delivery_type: 'DIRECT',
      delivery_role_id: null,
    });
  });

  return Array.from(recipientMap.values());
}

module.exports = {
  resolveEligibleRecipients,
};

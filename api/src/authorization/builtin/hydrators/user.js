const { Prisma } = require('@prisma/client');

const prisma = require('@/db');

const { PrismaHydrator } = require('../../core/hydrators/PrismaHydrator');

const userHydrator = new PrismaHydrator({ prismaClient: prisma, modelName: 'user', idAttribute: 'subject_id' });

// Named `current_roles`, not `roles`, so no request can supply it. A session's JWT profile
// carries `roles` from login time, and routes pass that profile as the pre-fetched user. A
// requirement no profile carries is always read from user_role, per request.
// @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 14
userHydrator.registerVirtualAttribute('current_roles', async ({ id, hydrator }) => {
  const dbClient = hydrator.prisma;
  const rows = await dbClient.user_role.findMany({
    // The relation on user_role is `users`, not `user`. Naming it wrongly threw only when
    // this attribute was actually hydrated, which routes never do — the auth middleware
    // pre-fetches req.user with its roles already attached.
    where: {
      users: {
        subject_id: id,
      },
    },
    include: {
      roles: true,
    },
  });
  return rows.map((row) => row.roles.name);
});

userHydrator.registerVirtualAttribute('group_memberships', async ({ id, hydrator }) => {
  // Direct memberships that are currently in force. Reads active_group_user, so a membership
  // that was removed or has passed its valid_until confers nothing, even though its row
  // survives for history. The unfiltered rows are reachable as `group_membership_history`.
  // @see docs/design/groups/decisions.md — 1. Membership and collection history are preserved
  const dbClient = hydrator.prisma;
  const sql = Prisma.sql`
    SELECT id, group_id, user_id, role, assigned_at, assigned_by, valid_until
    FROM active_group_user
    WHERE user_id = ${id}
  `;
  return dbClient.$queryRaw(sql);
});

userHydrator.registerVirtualAttribute('oversight_group_ids', async ({ id, hydrator }) => {
  // ids of strict descendants of groups U admins
  // does not include groups U is directly an admin of, unless U is also admin of descendant group
  // ex: A -> B -> C, if U is admin of A, then B and C will be in this list, but not A;
  // if U is admin of both A and B, then A will not be in this list, but B and C will be

  const dbClient = hydrator.prisma;
  const sql = Prisma.sql`
    SELECT DISTINCT group_id as id
    FROM effective_user_oversight_groups
    WHERE user_id = ${id}
  `;
  const rows = await dbClient.$queryRaw(sql);
  return rows.map((row) => row.id);
});

userHydrator.registerVirtualAttribute('is_anonymous', async () => false);
// A real user is never anonymous, so this loader answers for every signed-in caller. The
// anonymous principal carries `is_anonymous: true` in the pre-fetched user, which the
// hydrator prefers over running this, so the loader never sees an unauthenticated request.
// @see docs/design/groups/profiles.md — The anonymous principal

module.exports = { userHydrator };

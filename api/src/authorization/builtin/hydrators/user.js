const { Prisma } = require('@prisma/client');

const prisma = require('@/db');

const grantServices = require('@/services/grants');
const { PrismaHydrate } = require('../../core/hydrators/PrismaHydrator');

const userHydrator = new PrismaHydrate({ prismaClient: prisma, modelName: 'user', idAttribute: 'id' });

userHydrator.registerVirtualAttribute('roles', async ({ id, hydrator }) => {
  const dbClient = hydrator.prisma;
  const rows = await dbClient.user_role.findMany({
    where: {
      user_id: id,
    },
    include: {
      roles: true,
    },
  });
  return rows.map((row) => row.roles.name);
});

userHydrator.registerVirtualAttribute('effective_group_ids', async ({ id, hydrator }) => {
  // ids of all groups the use is a member of, and all ancestor groups of those groups

  const dbClient = hydrator.prisma;

  // find all groups the user is a direct member of, then find all ancestor groups of those groups using the
  // group_closure table
  const sql = Prisma.sql`
    SELECT DISTINCT group_id
    FROM effective_user_groups
    WHERE user_id = ${id}
  `;
  const rows = await dbClient.$queryRaw(sql);
  return rows.map((row) => row.id);
});

userHydrator.registerVirtualAttribute('oversight_group_ids', async ({ id, hydrator }) => {
  // ids of strict descendants of groups U admins
  // does not include groups U is directly an admin of, unless U is also admin of descendant group
  // ex: A -> B -> C, if U is admin of A, then B and C will be in this list, but not A;
  // if U is admin of both A and B, then A will not be in this list, but B and C will be

  const dbClient = hydrator.prisma;
  const sql = Prisma.sql`
    SELECT DISTINCT group_id
    FROM effective_user_oversight_groups
    WHERE user_id = ${id}
  `;
  const rows = await dbClient.$queryRaw(sql);
  return rows.map((row) => row.id);
});

userHydrator.registerVirtualAttribute('accessible_owner_group_ids', async ({ id, hydrator }) => {
  // ids of groups that own resources the user has grants on (e.g. if U has a grant on a collection owned by G,
  // then G's id will be in this list)
  const dbClient = hydrator.prisma;
  const sql = grantServices.ownerGroupIdsOfResourcesAccessibleByUserQuery(id);
  const rows = await dbClient.$queryRaw(sql);
  return rows.map((row) => row.id);
});

module.exports = { userHydrator };

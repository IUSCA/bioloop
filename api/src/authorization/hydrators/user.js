const { Prisma } = require('@prisma/client');

const prisma = require('@/db');

const { PrismaHydrate } = require('./base/prismaHydrator');

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

userHydrator.registerVirtualAttribute('all_group_ids', async ({ id, hydrator }) => {
  // ids of all groups the use is a member of, and all ancestor groups of those groups

  const dbClient = hydrator.prisma;

  // find all groups the user is a direct member of, then find all ancestor groups of those groups using the
  // group_closure table
  const sql = Prisma.sql`
    WITH user_groups AS (
      SELECT group_id
      FROM group_membership
      WHERE user_id = ${id}
    )
    SELECT DISTINCT gc.ancestor_id AS id
    FROM "group" g
    LEFT JOIN group_closure gc ON gc.descendant_id = g.id -- finding ancestors
    JOIN user_groups ug ON ug.group_id = g.id
  `;
  const rows = await dbClient.$queryRaw(sql);
  return rows.map((row) => row.id);
});

userHydrator.registerVirtualAttribute('oversight_group_ids', async ({ id, hydrator }) => {
  // ids of groups the user is an admin of, and all descendant groups of those groups.

  const dbClient = hydrator.prisma;
  const sql = Prisma.sql`
    WITH user_groups AS (
      SELECT group_id
      FROM group_user
      WHERE user_id = ${id}
      AND role = 'ADMIN' -- only consider groups where user is an admin for oversight purposes
    )
    SELECT DISTINCT gc.descendant_id AS id
    FROM "group" g
    LEFT JOIN group_closure gc ON gc.ancestor_id = g.id -- finding descendants
    JOIN user_groups ug ON ug.group_id = g.id
  `;
  const rows = await dbClient.$queryRaw(sql);
  return rows.map((row) => row.id);
});

// class UserHydrator extends PrismaHydrate {
//   constructor(options) {
//     super({ ...options, modelName: 'user', idAttribute: 'id' });
//   }

//   // overriding fetchPrismaRecord
//   async fetchPrismaRecord(payload) {
//     const include = payload.include || {};
//     include.user_role = {
//       include: {
//         role: true,
//       },
//     };

//     const modifiedPayload = { ...payload, include };

//     const userRecord = await this.prisma.user.findUniqueOrThrow(modifiedPayload);

//     // extract role names from user_role relation
//     const roles = userRecord.user_role.map((ur) => ur.role.name);
//     userRecord.roles = roles; // add virtual attribute to record
//     return userRecord;
//   }
// }

// const userHydrator = new UserHydrator({ prismaClient: prisma });

module.exports = userHydrator;

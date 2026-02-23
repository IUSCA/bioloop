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

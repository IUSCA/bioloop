const prisma = require('@/db');

const hydratorRegistry = require('./registry');
const { PrismaHydrate } = require('./base/prismaHydrate');

const userHydrator = new PrismaHydrate({ prismaClient: prisma, modelName: 'user', idAttribute: 'id' });

userHydrator.registerVirtualAttribute('roles', async ({ id, hydrator }) => {
  const dbClient = hydrator.prisma;
  const rows = await dbClient.user_role.findMany({
    where: {
      user_id: id,
    },
    include: {
      role: true,
    },
  });
  return rows.map((row) => row.role.name);
});

hydratorRegistry.register('user', userHydrator);

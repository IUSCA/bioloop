const prisma = require('@/db');

const { PrismaHydrator } = require('../../core/hydrators/PrismaHydrator');

const accessRequestHydrator = new PrismaHydrator({
  prismaClient: prisma,
  modelName: 'access_request',
  idAttribute: 'id',
});

// assumes recordCache has resource_id
// eslint-disable-next-line no-unused-vars
accessRequestHydrator.registerVirtualAttribute('resource2', async ({ id, hydrator }) => {
  const dbClient = hydrator.prisma;
  const resource = await dbClient.resource.findFirstOrThrow({
    where: {
      access_requests: {
        has: id,
      },
    },
    include: {
      dataset: true,
      collection: true,
    },
  });
  return resource;
});

module.exports = {
  accessRequestHydrator,
};

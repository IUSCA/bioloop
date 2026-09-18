const prisma = require('@/db');

const { PrismaHydrator } = require('../../core/hydrators/PrismaHydrator');

const collectionHydrator = new PrismaHydrator({
  prismaClient: prisma,
  modelName: 'collection',
});

module.exports = {
  collectionHydrator,
};

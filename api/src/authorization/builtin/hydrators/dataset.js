const prisma = require('@/db');

const { PrismaHydrator } = require('../../core/hydrators/PrismaHydrator');

const datasetHydrator = new PrismaHydrator({
  prismaClient: prisma,
  modelName: 'dataset',
  idAttribute: 'resource_id',
});

module.exports = {
  datasetHydrator,
};

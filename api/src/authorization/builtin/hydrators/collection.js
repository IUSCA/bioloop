const prisma = require('@/db');

const { PrismaHydrator } = require('../../core/hydrators/PrismaHydrator');

const collectionHydrator = new PrismaHydrator({
  prismaClient: prisma,
  modelName: 'collection',
});

/**
 * Whether the collection has ever held a dataset or has any access request.
 *
 * Deleting such a collection would destroy history decision 1 preserves, so `delete` admits
 * only a collection with none. A removed dataset still counts, because its row is the history.
 *
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 6
 */
collectionHydrator.registerVirtualAttribute('has_history', async ({ id, hydrator }) => {
  const [datasetRows, requestRows] = await Promise.all([
    hydrator.prisma.collection_dataset.count({ where: { collection_id: id } }),
    hydrator.prisma.access_request.count({ where: { resource_id: id } }),
  ]);
  return datasetRows + requestRows > 0;
});

module.exports = {
  collectionHydrator,
};

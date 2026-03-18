const prisma = require('@/db');

const grantService = require('@/services/grants');

/**
 * Return number of unarchived groups, unarchived datasets, unarchived collections, active users, active grants in the system
 */
async function getSystemStats() {
  const datasetPromise = prisma.dataset.count({
    where: { is_deleted: false },
  });
  const collectionPromise = prisma.collection.count({
    where: { is_archived: false },
  });
  const groupPromise = prisma.group.count({
    where: { is_archived: false },
  });
  const userPromise = prisma.user.count({
    where: { is_deleted: false },
  });
  const grantPromise = prisma.grant.count({
    where: grantService.getPrismaGrantValidityFilter(true),
  });

  const [datasets, collections, groups, users, grants] = await Promise.all([
    datasetPromise,
    collectionPromise,
    groupPromise,
    userPromise,
    grantPromise,
  ]);

  return {
    datasets,
    collections,
    groups,
    users,
    grants,
  };
}

module.exports = {
  getSystemStats,
};

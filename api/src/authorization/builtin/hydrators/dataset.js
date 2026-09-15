const prisma = require('@/db');

const { PrismaHydrator } = require('../../core/hydrators/PrismaHydrator');

const datasetHydrator = new PrismaHydrator({
  prismaClient: prisma,
  modelName: 'dataset',
  idAttribute: 'resource_id',
});

/**
 * Whether the group that owns this dataset accepts contributions from its ordinary members.
 *
 * A dataset has no such column; the flag lives on the owning group. The `contribute` action
 * needs it, and reading it here keeps the policy a pure in-memory check like every other.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — A1
 */
datasetHydrator.registerVirtualAttribute(
  'owner_group_allows_contributions',
  async ({ id, hydrator }) => {
    const row = await hydrator.prisma.dataset.findUnique({
      where: { resource_id: id },
      select: { owner_group: { select: { allow_user_contributions: true } } },
    });
    return row?.owner_group?.allow_user_contributions === true;
  },
);

module.exports = {
  datasetHydrator,
};

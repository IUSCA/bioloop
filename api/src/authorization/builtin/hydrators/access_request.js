const prisma = require('@/db');

const { PrismaHydrator } = require('../../core/hydrators/PrismaHydrator');

const accessRequestHydrator = new PrismaHydrator({
  prismaClient: prisma,
  modelName: 'access_request',
  idAttribute: 'id',
});

/**
 * The resource a request concerns, with whichever of dataset or collection it is.
 *
 * The owning-group and oversight policies both need the owning group, and it lives on the
 * dataset or the collection rather than on the `resource` row.
 *
 * `access_requests` is a relation, so it is filtered with `some`. It was written as `has`,
 * which Prisma accepts only on a scalar list, and every request that reached this attribute
 * failed with a 500 — which is every non-platform-admin read, review, submit, and withdraw.
 */
accessRequestHydrator.registerVirtualAttribute('resource2', async ({ id, hydrator }) => hydrator
  .prisma
  .resource
  .findFirstOrThrow({
    where: { access_requests: { some: { id } } },
    include: { dataset: true, collection: true },
  }));

module.exports = {
  accessRequestHydrator,
};

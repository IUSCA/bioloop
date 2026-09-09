const prisma = require('@/db');

const { PrismaHydrator } = require('../../core/hydrators/PrismaHydrator');

const grantHydrator = new PrismaHydrator({
  prismaClient: prisma,
  modelName: 'grant',
  idAttribute: 'id',
});

/**
 * Whether the grant is on a dataset or a collection.
 *
 * `isAdminOfResourceGroup` and `hasOversightOfResourceGroup` branch on it to find the owning
 * group, and it is not a column on `grant` — the type lives on the `resource` row the grant
 * points at. Without this the default hydrator raises `Unknown attributes: resource_type`,
 * which is a 500 on every grant action authorized by hydrating the row.
 *
 * Routes that authorize from a pre-fetched object supply `resource_type` themselves and never
 * reach this. `POST /grants/:id/revoke` has only an id, so it does.
 */
grantHydrator.registerVirtualAttribute('resource_type', async ({ id, hydrator }) => {
  const grant = await hydrator.prisma.grant.findUniqueOrThrow({
    where: { id },
    select: { resource: { select: { type: true } } },
  });
  return grant.resource.type;
});

module.exports = { grantHydrator };

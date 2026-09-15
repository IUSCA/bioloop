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

/**
 * Whether the grant's subject is a user or a group.
 *
 * `isSubject`, `isAdminOfSubjectGroup`, and `hasOversightOfSubjectGroup` read it, and it is not
 * a column on `grant`: the type lives on the `subject` row. Every route that reached these
 * policies pre-fetched `subject_type` from its URL, so the gap stayed invisible until the boot
 * check compared every declared requirement against what the hydrators can supply.
 * @see docs/design/groups/access-model-verification-plan.md — The static checks that already exist
 */
grantHydrator.registerVirtualAttribute('subject_type', async ({ id, hydrator }) => {
  const grant = await hydrator.prisma.grant.findUniqueOrThrow({
    where: { id },
    select: { subject: { select: { type: true } } },
  });
  return grant.subject.type;
});

/**
 * The group that owns the dataset or collection the grant is on.
 *
 * `isAdminOfResourceGroup` and `hasOversightOfResourceGroup` compare the caller's groups with
 * it. Routes that authorize before a grant exists pre-fetch `resource_id`, and the grant
 * routes keyed by a resource do the same, so the loader reads `resource_id` from the record
 * and fetches the grant row only when nothing supplied it.
 * @see docs/design/groups/access-model-verification-plan.md — Phase 4: the rule becomes a query
 */
grantHydrator.registerVirtualAttribute('resource_owner_group_id', async ({ id, recordCache, hydrator }) => {
  const resourceId = recordCache.resource_id ?? (await hydrator.prisma.grant.findUniqueOrThrow({
    where: { id },
    select: { resource_id: true },
  })).resource_id;
  const resource = await hydrator.prisma.resource.findUniqueOrThrow({
    where: { id: resourceId },
    select: { dataset: { select: { owner_group_id: true } }, collection: { select: { owner_group_id: true } } },
  });
  return resource.dataset?.owner_group_id ?? resource.collection?.owner_group_id;
});

module.exports = { grantHydrator };

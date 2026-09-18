const {
  Prisma,
  RESOURCE_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const { SYSTEM_PRINCIPAL_GROUP_IDS, PUBLIC_GROUP_ID } = require('@/constants');
const prisma = require('@/db');
const accessTypeClosure = require('./accessTypeClosure');

// The system principals every signed-in user belongs to, as a SQL VALUES-style union arm.
// A grant to either is honoured for any signed-in user: `Public` is the wider audience of
// the two, so it includes the authenticated one.
// @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
const SYSTEM_PRINCIPALS_SQL = Prisma.raw(
  SYSTEM_PRINCIPAL_GROUP_IDS.map((id) => `SELECT '${id}'`).join(' UNION '),
);

/**
 * The set of subject ids a caller's grants may be addressed to.
 *
 * The containment runs one way only. `Public` is the wider audience, so a signed-in caller
 * holds grants made to `Public` and to `Authenticated Users`. An unauthenticated caller
 * holds only what was granted to `Public`, and widening the set for them would hand out
 * every grant an admin meant for signed-in users.
 *
 * An unauthenticated caller arrives as the `Public` principal itself, which is a group row
 * rather than a user, so it has no memberships to expand.
 * @see docs/design/groups/decisions.md — 19. The anonymous caller is a principal, not a second code path
 *
 * A group subject holds what its ancestors hold, the way a member of it does. The closure arm
 * returns nothing for a user.
 *
 * @param {string} subject_id - a user's or group's subject id, or PUBLIC_GROUP_ID for an
 *   anonymous caller
 * @returns {Prisma.Sql} the body of a `subjects` CTE, selecting one `subject_id` column
 */
function subjectSetSql(subject_id) {
  if (subject_id === PUBLIC_GROUP_ID) {
    return Prisma.sql`SELECT ${PUBLIC_GROUP_ID} AS subject_id`;
  }
  return Prisma.sql`
      SELECT ${subject_id} AS subject_id
      UNION
      SELECT group_id
      FROM effective_user_groups
      WHERE user_id = ${subject_id}
      UNION
      SELECT ancestor_id
      FROM group_closure
      WHERE descendant_id = ${subject_id} AND depth > 0
      UNION
      ${SYSTEM_PRINCIPALS_SQL}`;
}

/**
 * Helper to get the owner group ID for a resource (dataset or collection)
 * @param {*} tx - Prisma transaction
 * @param {string} resource_id - UUID of the resource
 * @returns {Promise<string|null>} Owner group ID, or null if not found
 */
async function getResourceOwnerGroupId(tx, resource_id) {
  const resource = await tx.resource.findUnique({
    where: { id: resource_id },
    include: { collection: true, dataset: true },
  });
  if (!resource) return null;
  if (resource.type === RESOURCE_TYPE.DATASET) {
    return resource.dataset.owner_group_id;
  }
  if (resource.type === RESOURCE_TYPE.COLLECTION) {
    return resource.collection.owner_group_id;
  }
  return null;
}

function isAccessTypeOfType(accessTypeName, typePrefix) {
  return accessTypeName.startsWith(`${typePrefix}:`);
}

function isAccessTypeApplicableToResourceType(accessTypeName, resourceType) {
  if (resourceType === RESOURCE_TYPE.DATASET) {
    return isAccessTypeOfType(accessTypeName, 'DATASET');
  }
  if (resourceType === RESOURCE_TYPE.COLLECTION) {
    return isAccessTypeOfType(accessTypeName, 'DATASET') || isAccessTypeOfType(accessTypeName, 'COLLECTION');
  }
  return false;
}

async function assertGrantItemsApplicableToResourceType(tx, resourceType, items) {
  const db = tx || prisma;
  const accessTypeIds = new Set();
  const presetIds = new Set();

  for (const item of items) {
    if (item.access_type_id) accessTypeIds.add(item.access_type_id);
    if (item.preset_id) presetIds.add(item.preset_id);
  }

  const accessTypeById = new Map(
    (accessTypeIds.size > 0
      ? await db.grant_access_type.findMany({
        where: { id: { in: [...accessTypeIds] } },
        select: { id: true, name: true },
      })
      : []
    ).map((t) => [t.id, t.name]),
  );

  for (const item of items) {
    if (item.access_type_id) {
      const typeName = accessTypeById.get(item.access_type_id);
      if (!typeName) {
        throw createError.BadRequest(`access_type_id ${item.access_type_id} does not exist`);
      }
      if (!isAccessTypeApplicableToResourceType(typeName, resourceType)) {
        throw createError.BadRequest(`access_type ${typeName} not valid for resource type ${resourceType}`);
      }
    }
  }

  if (presetIds.size > 0) {
    const presets = await db.grant_preset.findMany({
      where: { id: { in: [...presetIds] }, is_active: true },
      include: {
        access_type_items: {
          include: {
            access_type: true,
          },
        },
      },
    });

    const existingPresetIds = new Set(presets.map((preset) => preset.id));
    for (const presetId of presetIds) {
      if (!existingPresetIds.has(presetId)) {
        throw createError.BadRequest(`preset_id ${presetId} does not exist or is not active`);
      }
    }

    for (const preset of presets) {
      if (!preset.resource_types.includes(resourceType)) {
        throw createError.BadRequest(`preset_id ${preset.id} is not applicable to resource type ${resourceType}`);
      }
    }
  }
}

/**
 * Refuses access request items that name a type only an admin grants, whether directly or
 * through a preset. Throws a 400 naming the type.
 *
 * Runs after `assertGrantItemsApplicableToResourceType`, which refuses unknown ids.
 * @param {object} [tx] - Prisma transaction; defaults to the shared client
 * @param {Array<{access_type_id?: number, preset_id?: number}>} items
 * @see docs/design/groups/ui-information-architecture.md — Access types in forms
 */
async function assertItemsRequestable(tx, items) {
  const db = tx || prisma;
  const accessTypeIds = items.map((item) => item.access_type_id).filter(Boolean);
  const presetIds = items.map((item) => item.preset_id).filter(Boolean);

  const [grantOnlyTypes, grantOnlyPresetItems] = await Promise.all([
    accessTypeIds.length > 0
      ? db.grant_access_type.findMany({
        where: { id: { in: accessTypeIds }, is_requestable: false },
        select: { name: true },
      })
      : [],
    presetIds.length > 0
      ? db.grant_preset_item.findMany({
        where: { preset_id: { in: presetIds }, access_type: { is_requestable: false } },
        select: { preset: { select: { name: true } }, access_type: { select: { name: true } } },
      })
      : [],
  ]);

  if (grantOnlyTypes.length > 0) {
    const names = grantOnlyTypes.map((t) => t.name).join(', ');
    throw createError.BadRequest(
      `access_type ${names} cannot be requested; an admin of the owning group gives it directly`,
    );
  }
  if (grantOnlyPresetItems.length > 0) {
    const [first] = grantOnlyPresetItems;
    throw createError.BadRequest(
      `preset ${first.preset.name} includes ${first.access_type.name}, which cannot be requested`,
    );
  }
}

module.exports = {
  subjectSetSql,
  ...accessTypeClosure,

  // resource compatibility helpers
  isAccessTypeApplicableToResourceType,
  assertGrantItemsApplicableToResourceType,
  assertItemsRequestable,

  // sql queries
  getResourceOwnerGroupId,
};

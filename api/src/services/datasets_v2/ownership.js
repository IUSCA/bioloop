const { Prisma } = require('@prisma/client');

const prisma = require('@/db');
const { accessPathsQuery } = require('@/authorization/builtin/accessPaths');
const { SYSTEM_PRINCIPAL_GROUP_IDS } = require('@/constants');
const { normalize_name } = require('./create');

/**
 * The groups a user might create a dataset in, before the engine decides.
 *
 * A platform admin gets every group that is not a system principal. Anyone else gets the groups
 * the path statement gives them an `admin` or `member` path on, each row carrying the path kinds
 * found. `GET /v2/datasets/eligible-owner-groups` decides `dataset.contribute` on every
 * candidate, so a closed group and a group the rule does not admit drop out there, by the rule
 * itself rather than by a copy of it here.
 *
 * An archived group is excluded here instead. Authorization no longer reads a resource's state,
 * so `dataset.contribute` says nothing about whether the group is archived: that is the group's
 * own state, and for a dataset that does not exist yet it is what the `dataset.create` rule
 * reads. `getOwnerGroupForAuthorization` refuses the same group when a create actually arrives,
 * so this list and that gate agree.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 *
 * The two system principals are excluded. `Public` and `Authenticated Users` are rows in the
 * group table so a grant can name them as a subject, but neither has members nor a place in the
 * hierarchy, so neither can own data. A platform admin passes `dataset.contribute` against any
 * group, so the exclusion has to sit ahead of the engine.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — A2
 * @param {Object} params
 * @param {string} params.user_id - the caller's subject id
 * @param {boolean} params.everyGroup - true for a platform admin
 * @returns {Promise<Array<{id, name, slug, description, allow_user_contributions, path_kinds: string[]}>>}
 */
async function listOwnerGroupCandidates({ user_id, everyGroup }) {
  const select = {
    id: true,
    name: true,
    slug: true,
    description: true,
    allow_user_contributions: true,
  };

  if (everyGroup) {
    const groups = await prisma.group.findMany({
      where: { id: { notIn: SYSTEM_PRINCIPAL_GROUP_IDS }, is_archived: false },
      select,
      orderBy: { name: 'asc' },
    });
    return groups.map((group) => ({ ...group, path_kinds: [] }));
  }

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT p.resource_id, array_agg(DISTINCT p.path_kind) AS path_kinds
    FROM (${accessPathsQuery({ userId: user_id, resourceType: 'group' })}) p
    WHERE p.path_kind IN ('admin', 'member')
    GROUP BY p.resource_id
  `);
  if (rows.length === 0) return [];
  const kindsById = new Map(rows.map((row) => [row.resource_id, row.path_kinds]));

  const groups = await prisma.group.findMany({
    where: { id: { in: [...kindsById.keys()], notIn: SYSTEM_PRINCIPAL_GROUP_IDS }, is_archived: false },
    select,
    orderBy: { name: 'asc' },
  });
  return groups.map((group) => ({ ...group, path_kinds: kindsById.get(group.id) }));
}

/**
 * The owning group's contribution flag, for authorizing against a group that owns nothing
 * yet. Returns null when the group does not exist, is archived, or is a system principal.
 *
 * Every v2 creation route resolves its owning group through here, so refusing the system
 * principals in one place refuses them for create, import, and upload alike. A platform
 * admin passes the `dataset.contribute` check against any group, so the exclusion has to
 * sit ahead of the policy engine rather than inside it.
 */
async function getOwnerGroupForAuthorization(owner_group_id) {
  if (SYSTEM_PRINCIPAL_GROUP_IDS.includes(owner_group_id)) return null;

  return prisma.group.findFirst({
    where: { id: owner_group_id, is_archived: false },
    select: { id: true, allow_user_contributions: true },
  });
}

/**
 * Is this name free for a new dataset of this type in this group?
 *
 * Scoped to one group, and the caller must be permitted to contribute to that group, so it
 * answers nothing about names held elsewhere. The legacy `GET /datasets/:type/:name/exists`
 * answers for any name in the system and is open to every `user` role; it is a global
 * existence oracle and this deliberately is not one.
 *
 * The name is normalised the same way creation normalises it, so the answer is about the
 * name that would actually be stored.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — A3
 */
async function isDatasetNameAvailable({ name, type, owner_group_id }) {
  const normalized_name = normalize_name(name);

  const existing = await prisma.dataset.findFirst({
    where: {
      owner_group_id, name: normalized_name, type, is_deleted: false,
    },
    select: { id: true },
  });

  return { available: !existing, normalized_name };
}

module.exports = {
  listOwnerGroupCandidates,
  getOwnerGroupForAuthorization,
  isDatasetNameAvailable,
};

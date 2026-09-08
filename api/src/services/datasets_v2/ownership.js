const prisma = require('@/db');
const { normalize_name } = require('./create');

/**
 * Which groups may own a dataset this user is about to create.
 *
 * Three rules admit a group, and each row says which one admitted it so the dialog can
 * explain the choice rather than presenting an unexplained list.
 *
 *   PLATFORM_ADMIN — a platform admin may place a dataset in any active group.
 *   ADMIN          — an admin of the group, whether or not it accepts contributions.
 *   CONTRIBUTOR    — an effective member of a group that has allow_user_contributions set.
 *
 * The rules mirror the `dataset.contribute` policy exactly. A group listed here is one the
 * engine will admit, and a group the engine admits appears here; the creation routes still
 * authorize, so this list is a convenience rather than the control.
 *
 * Archived groups are excluded. An archived group accepts no new datasets, because
 * dataset.contribute is classified as a mutating action.
 *
 * @see docs/design/groups/dataset-creation-plan.md — A2
 * @param {object} user - the authenticated user; needs subject_id and roles
 * @returns {Promise<Array<{id, name, slug, description, allow_user_contributions, admitted_by}>>}
 */
async function listEligibleOwnerGroups(user) {
  const is_platform_admin = user?.roles?.includes('admin') === true;

  const select = {
    id: true,
    name: true,
    slug: true,
    description: true,
    allow_user_contributions: true,
  };

  if (is_platform_admin) {
    const groups = await prisma.group.findMany({
      where: { is_archived: false },
      select,
      orderBy: { name: 'asc' },
    });
    return groups.map((group) => ({ ...group, admitted_by: 'PLATFORM_ADMIN' }));
  }

  // Direct admin memberships. Reads the active view, so a membership that was removed or
  // has expired confers nothing.
  const adminRows = await prisma.$queryRaw`
    SELECT DISTINCT group_id AS id
    FROM active_group_user
    WHERE user_id = ${user.subject_id} AND role = 'ADMIN'
  `;
  const adminGroupIds = new Set(adminRows.map((r) => r.id));

  // Effective membership includes ancestors of the groups the user belongs to, matching
  // isDatasetOwningGroupContributor.
  const memberRows = await prisma.$queryRaw`
    SELECT DISTINCT group_id AS id
    FROM effective_user_groups
    WHERE user_id = ${user.subject_id}
  `;
  const memberGroupIds = memberRows.map((r) => r.id);

  const candidateIds = [...new Set([...adminGroupIds, ...memberGroupIds])];
  if (candidateIds.length === 0) return [];

  const groups = await prisma.group.findMany({
    where: { id: { in: candidateIds }, is_archived: false },
    select,
    orderBy: { name: 'asc' },
  });

  return groups
    .map((group) => {
      if (adminGroupIds.has(group.id)) return { ...group, admitted_by: 'ADMIN' };
      if (group.allow_user_contributions) return { ...group, admitted_by: 'CONTRIBUTOR' };
      return null;
    })
    .filter(Boolean);
}

/**
 * The owning group's contribution flag, for authorizing against a group that owns nothing
 * yet. Returns null when the group does not exist or is archived.
 */
async function getOwnerGroupForAuthorization(owner_group_id) {
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
 * @see docs/design/groups/dataset-creation-plan.md — A3
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
  listEligibleOwnerGroups,
  getOwnerGroupForAuthorization,
  isDatasetNameAvailable,
};

const prisma = require('@/db');

const SOURCE_SELECT = {
  id: true,
  path: true,
  label: true,
  description: true,
  sort_order: true,
  status: true,
  status_reason: true,
  path_verified_at: true,
  owner_group_id: true,
  owner_group: { select: { id: true, name: true, slug: true } },
};

// mounted_path is deliberately absent from SOURCE_SELECT: it is a fact about where the API
// process happens to see the filesystem, and no caller needs it.

/**
 * Import sources the caller may browse, newest lifecycle rules applied.
 *
 * A source is listed when it names a group the caller belongs to, has oversight of, or
 * administers, and its status is ACTIVE or SUSPENDED. A SUSPENDED source is listed so the
 * user can see why it is unavailable rather than finding an empty directory listing.
 * RETIRED sources are not listed at all.
 *
 * A source with no owning group is never listed here. Those remain reachable through the
 * legacy global browse routes until cut-over.
 *
 * A platform admin sees every non-retired source.
 *
 * @see docs/design/groups/dataset-creation-plan.md — B1
 * @param {object} user - the authenticated user; needs subject_id and roles
 */
async function listImportSourcesForUser(user) {
  const orderBy = [
    { sort_order: { sort: 'asc', nulls: 'last' } },
    { label: 'asc' },
  ];

  if (user?.roles?.includes('admin')) {
    return prisma.import_source.findMany({
      where: { status: { not: 'RETIRED' }, owner_group_id: { not: null } },
      select: SOURCE_SELECT,
      orderBy,
    });
  }

  const groupIds = await reachableGroupIds(user.subject_id);
  if (groupIds.length === 0) return [];

  return prisma.import_source.findMany({
    where: { status: { not: 'RETIRED' }, owner_group_id: { in: groupIds } },
    select: SOURCE_SELECT,
    orderBy,
  });
}

/**
 * Groups whose sources this user may browse: the ones they are an effective member of, plus
 * the ones they have oversight over. Both are read from the views that already exclude
 * removed and expired memberships.
 */
async function reachableGroupIds(subject_id) {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT group_id AS id FROM effective_user_groups WHERE user_id = ${subject_id}
    UNION
    SELECT DISTINCT group_id AS id FROM effective_user_oversight_groups WHERE user_id = ${subject_id}
  `;
  return rows.map((r) => r.id);
}

/**
 * The source a path falls inside, restricted to the ones this caller may browse.
 *
 * Scoping the list without scoping the resolve is decoration: the contents would still be
 * served to a guessed path. Every v2 filesystem read goes through this.
 *
 * Returns null when the path falls inside no source the caller may reach, which the caller
 * reports as a refusal without saying whether such a source exists at all.
 *
 * @see docs/design/groups/dataset-creation-plan.md — B2
 */
async function resolveImportSourceForUser(user, resolvedPath) {
  const sources = await listImportSourcesForUser(user);

  const match = sources.find((source) => {
    const withSlash = source.path.endsWith('/') ? source.path : `${source.path}/`;
    return resolvedPath === source.path || resolvedPath.startsWith(withSlash);
  });

  if (!match) return null;
  if (match.status !== 'ACTIVE') return { ...match, unavailable: true };

  // mounted_path is needed to actually read, and is fetched only once a source has matched.
  const { mounted_path } = await prisma.import_source.findUnique({
    where: { id: match.id },
    select: { mounted_path: true },
  });
  return { ...match, mounted_path };
}

module.exports = {
  listImportSourcesForUser,
  resolveImportSourceForUser,
  reachableGroupIds,
  SOURCE_SELECT,
};

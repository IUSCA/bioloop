const fsp = require('node:fs/promises');
const { constants: fsConstants } = require('node:fs');

const prisma = require('@/db');
const logger = require('@/services/logger');

// Written into status_reason by the scheduled check, and the marker it uses to tell its own
// suspensions from a person's. Only its own are ever restored automatically.
const AUTOMATIC_SUSPENSION_REASON = 'Path is not readable by the application';

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

async function isReadableDirectory(target) {
  try {
    const stat = await fsp.stat(target);
    if (!stat.isDirectory()) return false;
    // Bitwise OR is how fs.access takes a mode; R_OK to list it, X_OK to descend into it.
    // eslint-disable-next-line no-bitwise
    await fsp.access(target, fsConstants.R_OK | fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

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
 * @see docs/design/groups/implementation/dataset-creation-plan.md — B1
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
 * The source a path falls inside, restricted to the ones this caller may browse.
 *
 * Scoping the list without scoping the resolve is decoration: the contents would still be
 * served to a guessed path. Every v2 filesystem read goes through this.
 *
 * Returns null when the path falls inside no source the caller may reach, which the caller
 * reports as a refusal without saying whether such a source exists at all.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — B2
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

/**
 * Confirm every ACTIVE source's path is readable, and suspend the ones that are not.
 *
 * An unmounted or renamed path returns an empty directory listing, which a user reads as
 * "my data is gone". Suspending the source says what actually happened instead, and the
 * listing shows the reason rather than nothing.
 *
 * A source that recovers is restored, because the common cause is a mount that came back.
 * Only sources this function suspended are restored: a SUSPENDED source with no
 * `status_reason` was suspended by a person and stays that way.
 *
 * Reads through mounted_path, which is where the API process actually sees the directory.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — B1a
 * @returns {Promise<{checked, suspended, restored}>}
 */
async function verifyImportSourcePaths() {
  const sources = await prisma.import_source.findMany({
    where: { status: { in: ['ACTIVE', 'SUSPENDED'] } },
    select: {
      id: true, path: true, mounted_path: true, label: true, status: true, status_reason: true,
    },
  });

  const suspended = [];
  const restored = [];

  for (const source of sources) {
    const target = source.mounted_path || source.path;
    // eslint-disable-next-line no-await-in-loop
    const readable = await isReadableDirectory(target);

    if (source.status === 'ACTIVE' && !readable) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.import_source.update({
        where: { id: source.id },
        data: { status: 'SUSPENDED', status_reason: AUTOMATIC_SUSPENSION_REASON },
      });
      suspended.push(source.label || source.path);
      logger.warn('[IMPORT SOURCES] suspended, path is not readable', { id: source.id, target });
    } else if (
      source.status === 'SUSPENDED'
      && readable
      && source.status_reason === AUTOMATIC_SUSPENSION_REASON
    ) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.import_source.update({
        where: { id: source.id },
        data: { status: 'ACTIVE', status_reason: null, path_verified_at: new Date() },
      });
      restored.push(source.label || source.path);
      logger.info('[IMPORT SOURCES] restored, path is readable again', { id: source.id, target });
    } else if (readable) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.import_source.update({
        where: { id: source.id },
        data: { path_verified_at: new Date() },
      });
    }
  }

  return { checked: sources.length, suspended, restored };
}

module.exports = {
  verifyImportSourcePaths,
  AUTOMATIC_SUSPENSION_REASON,
  listImportSourcesForUser,
  resolveImportSourceForUser,
  reachableGroupIds,
  SOURCE_SELECT,
};

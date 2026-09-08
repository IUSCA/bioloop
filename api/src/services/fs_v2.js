const fsp = require('node:fs/promises');
const path = require('node:path');

const logger = require('@/services/logger');

/**
 * Rebase a canonical import-source path onto wherever this process actually sees it.
 *
 * In most deployments the directory is at the same absolute path the row records, and this
 * returns the input unchanged. Where the filesystem is mounted elsewhere for the API
 * process, `import_source.mounted_path` names the mount point.
 */
function toMountedPath(userPath, sourcePath, mountedPath) {
  if (!mountedPath) return userPath;
  return path.join(mountedPath, userPath.slice(sourcePath.length));
}

/** Does this directory hold at least one file with the given extension? */
async function directoryContainsExtension(dirPath, extension) {
  if (!extension) return true;
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries.some((e) => !e.isDirectory() && e.name.endsWith(extension));
  } catch (err) {
    logger.warn('[FS v2] extension check failed', { dirPath, extension, error: err.message });
    return false;
  }
}

/** Keep only the entries the caller asked for: directories, and the extension filter. */
async function applyFilters(entries, { dirs_only, extension }, mountedOf) {
  const kept = dirs_only ? entries.filter((e) => e.isDir) : entries;
  if (!extension || !dirs_only) return kept;

  const checked = await Promise.all(kept.map(async (entry) => {
    if (!entry.isDir) return entry;
    return (await directoryContainsExtension(mountedOf(entry), extension)) ? entry : null;
  }));
  return checked.filter(Boolean);
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * List or match paths inside one import source.
 *
 * Three shapes of answer, matching what a directory typeahead needs:
 *
 *   a path ending in `/`   — the contents of that directory
 *   an existing path       — that one directory, so a complete typed path resolves
 *   a path that does not exist — entries of its parent whose names contain the last
 *                                segment, case-insensitively
 *
 * The caller has already resolved `source`, which is how the result is confined to a source
 * the user may browse. Nothing here re-checks that, so do not call it with a source the
 * caller did not resolve.
 *
 * @see docs/design/groups/dataset-creation-plan.md — B2
 */
async function browseImportSource({
  source, requestedPath, dirs_only = false, extension = null,
}) {
  const hasTrailingSlash = requestedPath.endsWith('/');
  const resolved = path.resolve(path.normalize(requestedPath));
  const { path: sourcePath, mounted_path: mountedPath } = source;

  const mountedOf = (entry) => toMountedPath(entry.path, sourcePath, mountedPath);
  const mountedTarget = toMountedPath(resolved, sourcePath, mountedPath);

  if (await exists(mountedTarget)) {
    if (!hasTrailingSlash) {
      const self = [{ name: path.basename(resolved), isDir: true, path: resolved }];
      return applyFilters(self, { dirs_only, extension }, mountedOf);
    }

    const entries = (await fsp.readdir(mountedTarget, { withFileTypes: true })).map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
      path: path.join(resolved, e.name),
    }));
    return applyFilters(entries, { dirs_only, extension }, mountedOf);
  }

  // Nothing at that path: treat the last segment as a search term within the parent.
  const parentPath = path.dirname(resolved);
  const term = path.basename(resolved).toLowerCase();

  const sourceWithSlash = sourcePath.endsWith('/') ? sourcePath : `${sourcePath}/`;
  if (parentPath !== sourcePath && !parentPath.startsWith(sourceWithSlash)) {
    // The parent climbed out of the source. Say nothing rather than reading it.
    return [];
  }

  const mountedParent = toMountedPath(parentPath, sourcePath, mountedPath);
  if (!await exists(mountedParent)) return [];

  const entries = (await fsp.readdir(mountedParent, { withFileTypes: true }))
    .filter((e) => e.name.toLowerCase().includes(term))
    .map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
      path: path.join(parentPath, e.name),
    }));
  return applyFilters(entries, { dirs_only, extension }, mountedOf);
}

module.exports = { browseImportSource, toMountedPath };

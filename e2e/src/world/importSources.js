const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { query } = require('./db');

/**
 * Import sources for the import flows: a real directory on disk, and the row that lets a
 * group browse it.
 *
 * The row is inserted through SQL, because no route registers an import source. A platform
 * admin inserts one by hand after confirming the API and the workers can read the path, so a
 * direct insert is the same act the product expects.
 *
 * The directory sits under the operating system's temporary directory, resolved through
 * `realpath`. On macOS `os.tmpdir()` is a symlink under `/var`, and the API compares the
 * resolved path against `import_source.path` as a string, so an unresolved path matches no
 * source.
 *
 * The API and the workers must run on the same machine as the suite. Both read the directory.
 *
 * @see docs/design/groups/dataset-creation.md — How a source gets registered, for now
 * @see docs/design/groups/e2e-test-flows.md — D7
 */

/** The parent of every run's source directories, so teardown can find them by prefix. */
function sourcesRoot() {
  return fs.realpathSync(os.tmpdir());
}

/**
 * Creates a source directory holding the named subdirectories, each with one small file, and
 * registers it as an ACTIVE source owned by the group.
 *
 * The file matters to the workflow an import starts. Its `await stability` step waits until
 * nothing under the directory has changed for the workers' recency threshold, which is 30
 * seconds in development. A freshly written file therefore holds the workflow before it
 * reads or archives anything, and gives the spec that window to pause it.
 */
async function createImportSource({ prefix, label, ownerGroupId, directories }) {
  const root = fs.mkdtempSync(path.join(sourcesRoot(), `${prefix}-source-`));
  for (const name of directories) {
    fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, name, 'README.txt'), `Fixture directory ${name}.\n`);
  }

  const [row] = await query(
    `INSERT INTO import_source (path, label, owner_group_id, status, updated_at)
     VALUES ($1, $2, $3, 'ACTIVE', now())
     RETURNING id, path, label`,
    [root, label, ownerGroupId],
  );
  return row;
}

/**
 * Removes a run's source rows and directories.
 *
 * The rows go by owning group, because `import_source.owner_group` restricts deletion and has
 * to precede the group. The directories go by name prefix, and only under the temporary
 * root, so nothing outside a run's own directories can match.
 */
async function removeImportSources(client, { prefix, groupIds }) {
  await client.query('DELETE FROM import_source WHERE owner_group_id = ANY($1::text[])', [groupIds]);

  const root = sourcesRoot();
  for (const entry of fs.readdirSync(root)) {
    if (entry.startsWith(`${prefix}-source-`)) {
      fs.rmSync(path.join(root, entry), { recursive: true, force: true });
    }
  }
}

module.exports = { createImportSource, removeImportSources };

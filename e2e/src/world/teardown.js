const { withClient } = require('./db');
const { prefixFor } = require('./build');
const { removeImportSources } = require('./importSources');

/**
 * Removes everything a run built, in one transaction.
 *
 * Through SQL rather than through the API, because the API deliberately offers no way:
 * there is no `DELETE /groups/:id`, and `DELETE /v2/datasets/:id` keeps the dataset's record.
 * Archiving is not deletion and history is preserved, so adding a destructive endpoint to serve
 * a test suite would put a hole in the model. Teardown is not a thing under test, so it goes
 * around it.
 *
 * Order follows the foreign keys that RESTRICT. Everything else cascades: `group_user`,
 * `group_closure`, and every `dataset_*` child go with their parent.
 *
 * Nothing seeded is touched. Every statement is bounded by the run's own group ids, so a
 * seeded membership is never removed and a borrowed account is left exactly as it was found.
 *
 * Ids are cast to `text[]`, not `uuid[]`: Prisma declares these columns as `String`, so
 * `group.id`, `resource.id`, `subject.id`, and every id referencing them are `text` in
 * Postgres. A `uuid[]` cast fails with `operator does not exist: text = uuid`.
 *
 * @see docs/design/groups/e2e-test-flows.md — How the suite builds its world
 */
async function teardownWorld(runId) {
  const prefix = prefixFor(runId);
  return withClient(async (client) => {
    try {
      await client.query('BEGIN');

      const { rows: groupRows } = await client.query(
        'SELECT id FROM "group" WHERE name LIKE $1',
        [`${prefix}-%`],
      );
      const groupIds = groupRows.map((r) => r.id);
      if (groupIds.length === 0) {
        await client.query('COMMIT');
        return { groups: 0, datasets: 0, collections: 0 };
      }

      // Resources this run owns: a dataset points at a resource row, and a collection's own id
      // is one.
      const { rows: datasetRows } = await client.query(
        'SELECT id, resource_id FROM dataset WHERE owner_group_id = ANY($1::text[])',
        [groupIds],
      );
      const { rows: collectionRows } = await client.query(
        'SELECT id FROM collection WHERE owner_group_id = ANY($1::text[])',
        [groupIds],
      );
      const resourceIds = [
        ...datasetRows.map((r) => r.resource_id),
        ...collectionRows.map((r) => r.id),
      ];

      // `grant.resource` and `grant.subject` are both ON DELETE RESTRICT, so grants go first —
      // the ones on this run's resources, and the ones held by its groups.
      await client.query(
        'DELETE FROM "grant" WHERE resource_id = ANY($1::text[]) OR subject_id = ANY($2::text[])',
        [resourceIds, groupIds],
      );

      // `access_request.subject_id` is RESTRICT, so a request naming one of this run's groups
      // as its subject has to go explicitly rather than by cascade from the resource.
      await client.query(
        'DELETE FROM access_request WHERE resource_id = ANY($1::text[]) OR subject_id = ANY($2::text[])',
        [resourceIds, groupIds],
      );

      // Both hold a RESTRICT reference to `resource`, so they precede it.
      await client.query('DELETE FROM collection WHERE owner_group_id = ANY($1::text[])', [groupIds]);
      await client.query('DELETE FROM dataset WHERE owner_group_id = ANY($1::text[])', [groupIds]);
      await client.query('DELETE FROM resource WHERE id = ANY($1::text[])', [resourceIds]);

      // `import_source.owner_group` is RESTRICT. Its directories go with it.
      await removeImportSources(client, { prefix, groupIds });

      // The group cascades its memberships and its closure rows. Its subject row holds a
      // RESTRICT reference the other way, so it follows.
      //
      // `group.parent_id` is ON DELETE RESTRICT and the check is immediate, so a parent and its
      // children cannot go in one statement however the ids are ordered. They go one at a time,
      // deepest first, with the depth read from the run's own closure rows.
      //
      // Clearing `parent_id` across the set first would be shorter, and it is wrong: it makes
      // every group a root, and two groups in one run may share a name. The
      // `(parent_id, name) NULLS NOT DISTINCT` index then refuses the update.
      const { rows: ordered } = await client.query(
        `SELECT g.id
           FROM "group" g
           LEFT JOIN (
             SELECT descendant_id, max(depth) AS depth FROM group_closure GROUP BY descendant_id
           ) d ON d.descendant_id = g.id
          WHERE g.id = ANY($1::text[])
          ORDER BY COALESCE(d.depth, 0) DESC`,
        [groupIds],
      );
      for (const row of ordered) {
        // eslint-disable-next-line no-await-in-loop
        await client.query('DELETE FROM "group" WHERE id = $1', [row.id]);
      }
      await client.query('DELETE FROM subject WHERE id = ANY($1::text[])', [groupIds]);

      await client.query('COMMIT');
      return {
        groups: groupIds.length,
        datasets: datasetRows.length,
        collections: collectionRows.length,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}

module.exports = { teardownWorld };

// Cleaning up after a crashed run: `node src/world/teardown.js <runId>`.
if (require.main === module) {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Usage: node src/world/teardown.js <runId>');
    process.exit(1);
  }
  teardownWorld(runId)
    .then((counts) => console.log(`removed ${JSON.stringify(counts)} for run ${runId}`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

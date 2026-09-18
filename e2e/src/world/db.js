const { Client } = require('pg');
const { databaseConfig } = require('./api');

/**
 * Direct database access, for the three jobs the API cannot do.
 *
 * **Teardown**, because the API deliberately offers no way to remove a group or a dataset row —
 * archiving is not deletion, a dataset delete keeps its record, and adding a destructive
 * endpoint to serve a test suite would put a hole in the model.
 *
 * **Choosing which accounts to borrow**, because no route answers "which users belong to no
 * group". That is a read, so it bypasses no creation path and the world is still built
 * through the API.
 *
 * **Registering an import source**, because no route creates one. A platform admin inserts the
 * row by hand in the product too, so the insert is the act the product expects rather than a way
 * around a creation path.
 *
 * Nothing else may use this. A spec that reads the database to check an outcome is asserting
 * against rows rather than against what a person can see, which is the API suites' job.
 *
 * @see docs/design/groups/e2e-test-flows.md — How the suite builds its world
 */
async function withClient(fn) {
  const client = new Client(databaseConfig());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** One statement, one result set. */
async function query(sql, params = []) {
  return withClient(async (client) => (await client.query(sql, params)).rows);
}

/**
 * An arbitrary constant identifying the world-building lock. Postgres advisory locks are
 * namespaced only by this number, so it needs to be unlikely to collide with another tool's
 * choice rather than to mean anything.
 */
const WORLD_BUILD_LOCK = 8100071;

/**
 * Runs `fn` with no other worker building a world at the same time.
 *
 * Workers choose their accounts by asking which seeded users belong to no group. Run two
 * builds concurrently and both read that list before either writes to it, so both borrow the
 * same six people: Alice in one world is Alice in the other, administering two labs at once.
 * Every later assertion about what she can reach then has two explanations. Measured, not
 * predicted — two builds started together returned identical account lists.
 *
 * Serialising is the whole fix because the race is in the read-then-write, and a build takes
 * roughly a third of a second. The alternative, handing each worker a disjoint slice of the
 * pool, needs an argument about how removals shift a later worker's offset; this needs none.
 *
 * The lock is session-scoped, so closing the connection releases it. A worker killed
 * mid-build cannot leave the suite deadlocked.
 */
async function withWorldBuildLock(fn) {
  const client = new Client(databaseConfig());
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [WORLD_BUILD_LOCK]);
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [WORLD_BUILD_LOCK]);
    }
  } finally {
    await client.end();
  }
}

module.exports = { withClient, query, withWorldBuildLock };

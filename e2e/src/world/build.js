const { signIn, clientFor } = require('./api');
const { query } = require('./db');
const {
  FIXED_ACCOUNTS, ASSIGNED_CAST, HIERARCHY, DATASETS, COLLECTIONS, EXTRA_GRANTS, EXTRA_STANDING,
} = require('./cast');

/**
 * Builds the fixture world through the HTTP API, as a platform admin.
 *
 * Through the API rather than through Prisma, because the API is the thing under test: a
 * world assembled by direct inserts can be one the API would refuse — a dataset with no
 * resource row, a group with no closure entry — and the fixture is then a check that the
 * creation paths work rather than a way around them.
 *
 * Nothing seeded is mutated. Every row this writes carries the run identifier in its name,
 * so a crashed run leaves rows that are obviously orphaned and a later run cannot collide
 * with them.
 *
 * @see docs/design/groups/implementation/e2e-test-plan.md — Build the world, borrow the people
 */

/** Six accounts to borrow, and the number is the size of the assigned cast. */
const BORROWED_ACCOUNT_COUNT = ASSIGNED_CAST.length;

function prefixFor(runId) {
  return `e2e-${runId}`;
}

/**
 * The seed's own sample-user pool, which is where a borrowed account comes from.
 *
 * Restricted to `user-0NN` on purpose. The unaffiliated pool also holds leavings from other
 * suites — `testuser_<timestamp>_*` rows an API test created and did not remove — and an
 * account another suite may delete mid-run is not one to build a world on.
 */
const SEEDED_USER_PATTERN = 'user-%';

/**
 * Seeded accounts to lend the assigned cast, chosen because they belong to **no** group.
 *
 * The membership matters. The seed puts users into its sample groups by hashing, so an
 * arbitrary `user-0NN` arrives already a member of a lab and already an admin of something.
 * A person like that carries standing the run did not give them, and a spec asserting what
 * they can reach then has two explanations for every answer.
 *
 * The accounts in `FIXED_ACCOUNTS` are excluded explicitly. Quinn is the zero-access person,
 * so lending her account to Dana makes the centre admin and the person who can reach nothing
 * the same user, and every refusal Quinn is supposed to demonstrate turns into an allow.
 *
 * No route answers "which users belong to no group", so this is a database read. It writes
 * nothing, so the world is still built through the API.
 *
 * Ordered by username so a run is reproducible and a failure names accounts a person can
 * look up.
 */
async function borrowAccounts() {
  const rows = await query(
    `SELECT u.username, u.subject_id
       FROM "user" u
      WHERE u.is_deleted = false
        AND u.username LIKE $1
        AND u.username <> ALL($2::text[])
        AND u.subject_id NOT IN (
          SELECT gu.user_id FROM group_user gu WHERE gu.removed_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM user_role ur
            JOIN role r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.name <> 'user'
        )
      ORDER BY u.username
      LIMIT $3`,
    [SEEDED_USER_PATTERN, Object.values(FIXED_ACCOUNTS), BORROWED_ACCOUNT_COUNT],
  );

  if (rows.length < BORROWED_ACCOUNT_COUNT) {
    throw new Error(
      `Need ${BORROWED_ACCOUNT_COUNT} seeded '${SEEDED_USER_PATTERN}' accounts that hold only the `
      + `'user' role and belong to no group; found ${rows.length}. Has the database been seeded?`,
    );
  }
  return rows;
}

/** The two accounts whose identity is fixed, resolved to subject ids. */
async function resolveFixedAccounts(admin) {
  const resolved = {};
  for (const [key, username] of Object.entries(FIXED_ACCOUNTS)) {
    // eslint-disable-next-line no-await-in-loop
    const { users } = await admin.get(`/v2/users?search=${encodeURIComponent(username)}&take=5`);
    const match = (users || []).find((u) => u.username === username);
    if (!match) {
      throw new Error(`Seeded account '${username}' not found. Has the database been seeded?`);
    }
    resolved[key] = { key, username, subject_id: match.subject_id };
  }
  return resolved;
}

/**
 * Builds the whole world and returns a handle onto it.
 *
 * The order is fixed by the model: groups top-down so each child has a parent, then
 * datasets, then collections, then grants.
 */
async function buildWorld(runId) {
  const prefix = prefixFor(runId);
  const { token } = await signIn(FIXED_ACCOUNTS.priya);
  const admin = clientFor(token);

  const accounts = await resolveFixedAccounts(admin);
  const borrowed = await borrowAccounts();

  // Assign each named person an account, and record which group standing they will hold.
  const people = { ...accounts };
  ASSIGNED_CAST.forEach((entry, i) => {
    people[entry.key] = {
      key: entry.key,
      username: borrowed[i].username,
      subject_id: borrowed[i].subject_id,
      group: entry.group,
      role: entry.role,
    };
  });

  // Groups, parents before children. Members and admins go in the create call rather than
  // through a second request, so a group is never briefly ungoverned.
  const groups = {};
  for (const node of HIERARCHY) {
    // Both lists, because a person's standing can come from either: their one cast entry, or
    // an extra membership recorded beside it.
    const standing = [...ASSIGNED_CAST, ...EXTRA_STANDING];
    const admins = standing
      .filter((c) => c.group === node.key && c.role === 'ADMIN')
      .map((c) => people[c.key].subject_id);
    const members = standing
      .filter((c) => c.group === node.key && c.role === 'MEMBER')
      .map((c) => people[c.key].subject_id);

    const body = {
      name: `${prefix}-${node.suffix}`,
      description: `Fixture group for end-to-end run ${runId}.`,
      admins,
      members,
    };
    const url = node.parent ? `/groups/${groups[node.parent].id}/children` : '/groups';
    // eslint-disable-next-line no-await-in-loop
    const created = await admin.post(url, body);
    groups[node.key] = created;
  }

  // Datasets. `origin_path` is required and never read by anything this suite asserts, so it
  // is a deterministic string under the run's own name rather than a real directory.
  const datasets = {};
  for (const spec of DATASETS) {
    // eslint-disable-next-line no-await-in-loop
    datasets[spec.key] = await admin.post('/v2/datasets', {
      name: `${prefix}-${spec.suffix}`,
      type: spec.type,
      owner_group_id: groups[spec.group].id,
      origin_path: `/tmp/${prefix}/${spec.suffix}`,
      description: `Fixture dataset for end-to-end run ${runId}.`,
    });
  }

  const collections = {};
  for (const spec of COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    collections[spec.key] = await admin.post('/collections', {
      name: `${prefix}-${spec.suffix}`,
      description: `Fixture collection for end-to-end run ${runId}.`,
      owner_group_id: groups[spec.group].id,
      // `dataset_ids` are dataset *resource* UUIDs despite the name — the route validates
      // `isUUID` and the handler matches on `resource_id`. `dataset.id` is an integer and is
      // rejected here.
      dataset_ids: spec.datasets.map((k) => datasets[k].resource_id),
    });
  }

  // The grants the world holds beyond each dataset's own owning-group seed. Issued as the
  // platform admin, because the point is the state they leave behind rather than who may
  // issue one — that is F10's subject, and it is asserted separately.
  const accessTypeRows = await admin.get('/grants/access-types');
  const accessTypeIds = Object.fromEntries(accessTypeRows.map((t) => [t.name, t.id]));

  for (const spec of EXTRA_GRANTS) {
    // eslint-disable-next-line no-await-in-loop
    await admin.post('/grants', {
      subject_id: groups[spec.subjectGroup].id,
      resource_type: 'DATASET',
      resource_id: datasets[spec.dataset].resource_id,
      justification: `Fixture grant for end-to-end run ${runId}.`,
      items: [{
        access_type_id: accessTypeIds[spec.accessType],
        approved_expiry: { type: 'never', value: null },
      }],
    });
  }

  // Access types indexed by name. Their ids are database integers that move between
  // environments, so a spec naming `DATASET:DOWNLOAD` stays readable and stays correct;
  // one carrying the literal `3` is neither.
  const accessTypes = accessTypeIds;

  return {
    runId, prefix, people, groups, datasets, collections, accessTypes,
  };
}

module.exports = { buildWorld, prefixFor, BORROWED_ACCOUNT_COUNT };

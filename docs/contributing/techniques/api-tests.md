---
title: Running and Writing the API Tests
---

# Running and Writing the API Tests

This page explains how the Jest suites under `api/tests` run, and why each of their traps
behaves the way it does. The short operational checklist lives in the `api-tests` agent skill
at `.claude/skills/api-tests/SKILL.md`. This page holds the reasoning and the detail behind it.

## Invoking Jest

The suites run from `api/`, one file at a time:

```sh
cd api
npx jest --runInBand                       # everything
npx jest --runInBand tests/services/groups # one directory
```

`--runInBand` is required. The service suites talk to a real database. The concurrency suites
race transactions against real constraints on purpose. Parallel workers produce failures that
mean nothing.

### The working directory decides which config Jest finds

Jest started from the repository root picks up the root config. It then tries to run the UI
and e2e suites too. The summary reports about a hundred suites failing while `Tests:` reports
0 failed, because those suites failed to *run*. Read the `Tests:` line before the `Suites:`
line.

The shell's working directory also drifts between tool calls. A `cd` in one Bash call changes
the directory for the calls that follow. Several calls issued in one turn finish in an
unpredictable order. After a UI command, Jest reports `No tests found` and names
`.../bioloop/ui` as the directory it searched. The failure rarely looks like a path problem:

- `jest` prints nothing and looks like a pass.
- `grep` or `sed` reports "No such file or directory" for a file that exists.
- A shell glob reports "no matches found".
- A backgrounded run exits 127, because `./node_modules/.bin/jest` does not exist there.

The last case is the dangerous one. The background task completes, and its output file holds
one line of shell error. A run that never happened looks like a run that finished. Use an
absolute path for the Jest binary, for the output file, and for every file argument. Read the
first line of the output before reading the summary.

### A file argument that does not exist is skipped without a word

Jest treats each file argument as a pattern. A path that matches nothing is not an error when
another argument matches, so the run passes without the file. On 2026-09-17 a run named
`tests/routes/route_policy_bindings.test.js`, which lives under `tests/authorization/`. The
summary said 29 suites passed, and two failing tests in that file went unreported. Check that
the summary's suite count matches the files you meant, or run `ls` on the arguments first.

### Jest does not exit after a finished run

After the last suite, Jest prints `Test Suites: ...` and then `Jest did not exit one second
after the test run has completed`. The Redis and SSE clients that the services open stay
connected, so the process idles at 0% CPU. That looks exactly like a stalled test.

- Write the output straight to a file, and look for the `Test Suites:` line.
- Do not pipe Jest through `grep`. The pipe buffers until the process exits, which it never
  does. The pipeline's exit code is also `grep`'s, so a failing suite reports success.
- Pass `--forceExit` when the run should end on its own.
- Before starting a run, list existing runs with
  `ps -eo pid,etime,args | grep "[j]est --runInBand"`. Stop runs that already printed a summary.

### Running a revert experiment from a script file

A heredoc typed into the Bash tool runs under zsh with the user's profile loaded. There, `rm`
and `cp` are aliased to their `-i` forms. An unquoted `$SUITES` stays one word, so Jest reports
"No tests found" for the joined paths. `set -- $var` does not split words either, so a loop
over `"2 8" "6 12"` passes NaN. Put the experiment in a file and run it with `bash file.sh`.

## The test database

Jest's `setupFiles` loads `api/tests/testDatabase.js`. That module sets `DATABASE_URL` to
`<DATABASE_DB>_test` on the same server before anything opens a Prisma client. Locally that is
`app_test` on `localhost:5433`. `src/db.js` loads `.env` through dotenv-safe, which never
overrides a variable already set, so the override holds. The running API and the browser keep
the development database.

- **Create and seed it once.** Run `CREATE DATABASE app_test` as the `.env` user. Then run
  `npm run test:db:setup`, which runs `prisma migrate deploy` and `prisma db seed` against it.
  Run the same script after adding a migration.
- **Resetting it needs the user's consent.** Prisma refuses `prisma migrate reset` when an AI
  agent invokes it. It demands consent given in a message sent after the refusal. An earlier
  "you may reset the database" does not count. Ask the user in its own question. Do not drop
  the database by another route to get around the refusal.
- **Two suites reach the development database.** `tests/routes/health.test.js` and
  `tests/routes/auth/singup.test.js` call the running API on port 3030 through
  `tests/request.js`.
- **A standalone script reaches the development database** when it requires `@/db` outside
  Jest. Require `tests/testDatabase.js` first.

## Getting a baseline without `git stash`

`git stash push -- <paths>` resolves paths against the current working directory. Run from
`api/` with repository-relative paths, it fails with
`pathspec ':(prefix:4)api/api/src' did not match any file(s)`. It creates no stash. A
`git stash pop` that follows then pops whatever unrelated stash the user already had. Their
work-in-progress lands in the tree as a merge conflict.

`&&` does not protect the chain. When the failing `git` sits upstream of a `tail` in a
pipeline, the pipeline still exits 0.

A worktree gives a genuine before-and-after baseline:

```sh
git worktree add /tmp/baseline HEAD
```

Pure unit suites, such as anything under `tests/authorization/core`, need no database and run
there directly. Service suites do not, because the worktree shares the migrated database with
the branch.

## Restoring a file mutated on purpose

A new test earns trust when it fails without its fix. Checking that means breaking the fix,
running the test, and putting the fix back. The putting-back is the step that goes wrong.

`cp` is interactive in this environment. `cp /tmp/keep.js src/....js` asks
`overwrite src/...? (y/n [n])`. A prompt inside a backgrounded tool call waits forever. The
mutated file then stays in the tree.

Restore with the same edit script run in reverse, or with `cp -f`. Put the restore in its own
call, not chained after a Jest run that may outlive the foreground timeout. Confirm with
`git diff` that only the intended change is left.

## Telling a new failure from an existing one

Check the cheap signals in this order.

1. **`git status`.** A suite failing under `tests/authorization/core` after a change confined
   to `src/services` is almost never caused by that change.
2. **The error text, not the test name.** `X is not a constructor` and `X is not a function`
   mean an import name drifted. They say nothing about behaviour.
3. **The suite alone, several times.** Rerun the failing file alone three or four times, and
   report the counts. A concurrency suite that fails once in six identical runs has a race in
   the test.
4. **Whether the API is up.** The route suites under `tests/routes/` call the running server.
   A wall of bare `AggregateError` with no message is a refused connection.
   `bin/devserver.sh status` reports the nodemon process, which stays alive after the app
   inside it crashes. Read `logs/api.log` or check the listening port instead. A
   `prisma migrate reset` crashes the API mid-run, because access types briefly do not exist.
   Restart it after the reset finishes.
5. **Whether the duration is round.** See below.

### Order-dependent suites

A single failure in a full run is usually cross-suite interference. The suites share
`app_test` with each other, so a row one suite leaves behind can change another suite's
premise. `tests/routes/health.test.js`, `tests/services/grants/coverage.test.js`,
`tests/services/invitations/invitation.hook.test.js`, and
`tests/services/grants/anonymousSubjectSet.test.js` have each failed intermittently in a full
run and then passed on their own. The standing instances are filed in
`.todo/local/misc-carryover.md`.

"Passes alone" is not proof of interference by itself. `anonymousSubjectSet.test.js` also
failed alone once. Its own `afterEach` explains why: two of its tests contend for the
`grant_no_overlap` exclusion constraint on one collection and access type. That mechanism is
inside the file. Only the distribution over several runs separates the two causes.

A failure that reproduces in every full run and never in a targeted run points at real shared
state, not timing. Treat it as a defect. The concurrent count assertion described under
[Count assertions](#count-assertions-that-the-access-type-order-can-absorb) was that shape.

When a suspect stays intermittent, record it as order-dependent rather than claiming a fix.
Settling it needs a seeded run order, or finding the suite that leaves a row behind.

### A round duration is a timeout somewhere

A test that takes 5 seconds, the Jest default limit, or a multiple of 10 seconds is reporting
a timeout. Rerun it with `--testTimeout=60000`. If it passes and prints a round number, an
external service is accepting the connection and not answering.

`tests/services/imports/dataset.import.test.js` shows the shape. Exactly the two tests that
reach `createWorkflow` took about 30 seconds each. The four that refuse before it took
milliseconds. A later test then failed on `Cannot read properties of null`, because it read a
dataset the timed-out test never created. It recovered with no code change. The docker stack
had just started, so the workflow service was most likely still coming up.

To find which `await` is slow, write a timing probe of the service to the scratchpad, never
into `api/`. Register the module alias by hand so the resolver finds `@/`:

```js
require('<abs path>/api/node_modules/module-alias').addAlias('@', '<abs path>/api/src');
```

## Tests written against old names

The ABAC work renamed things without always updating tests. These shapes recur:

- **Class renames.** `Hydrate` is now `Hydrator`, and `PrismaHydrate` is now
  `PrismaHydrator`. A whole suite fails at `extends undefined`.
- **Consolidated functions.** `authorize()` is folded into `authorizeWithFilters()`. It returns
  `{ granted, filter }`, not a bare boolean. It validates `attributeRules` before anything
  else, so a retargeted call needs `attributeRules: []`.
- **Identifier changes.** The authorization middleware identifies a caller by
  `user.subject_id`, not the numeric `user.id`. Older tests pass `{ id: 77 }`.
- **Argument shapes.** `listPresets({ resource_type })` takes an object. A call written as
  `listPresets('DATASET')` destructures to `undefined` and drops the filter silently. Every
  seeded preset is scoped to collections, so the wrong call returns both collection presets,
  and the correct call returns none.

In each case the production code is right and the test is stale. Check the caller in
`src/routes` before changing either.

## Concurrency suites

### Timeout

Every test that calls `runRace()` runs `RACE_RUNS` (default 8) sequential iterations. Each
iteration provisions fixtures, fires several concurrent writes, and tears down. That exceeds
Jest's 5 second default. Such tests pass against a warm database and time out against a cold
one, which is what a reset leaves behind.

Each concurrency file calls `jest.setTimeout(RACE_TIMEOUT_MS)`.
`tests/services/concurrency-utils.js` exports that constant as `RACE_RUNS * 2_000`, so raising
`RACE_RUNS` from the environment raises the budget with it. A new
`tests/services/<area>/*.concurrency.test.js` file needs the same line. A race test that times
out is almost always missing it.

### Two correct rejections

Two transactions that revoke and recreate a grant for the same subject, resource, and access
type contend for the `grant_no_overlap` exclusion constraint. Postgres resolves the contention
in one of two ways:

- It raises the constraint violation, which the service turns into a 409.
- It detects a deadlock, when the two took their locks in opposite orders. That arrives as a
  raw Prisma error with Postgres code `40P01` and no HTTP status.

Timing decides which one happens. Exactly one transaction commits either way, and that is the
invariant these tests check. `RACE_REJECTION_PATTERN` in `concurrency-utils.js` accepts both
messages. A status assertion reads `expect([409, undefined]).toContain(status)`. If a race test
turns intermittent, check for an assertion on only one of the two before calling the timing
unfixable. Eight consecutive clean runs is a reasonable bar for calling a suite settled.

## Writing assertions

### Cover the shape a caller receives

Logic tests can pass while the return shape is wrong. `evaluateCapabilitySet` returns a map of
action name to boolean, not a list. Code written against it as a list throws
`capabilities is not iterable` on the first real request.

When wrapping or filtering something on the request path, assert on the shape the caller
receives. A quick check before writing the wrapper:

```sh
node -e "global.__basedir=process.cwd(); require('module-alias/register');
  const x = require('@/some/module'); console.log(typeof x.thing, x.thing)"
```

The service suites do not cover the middleware. After a middleware change, exercise the page
in a browser. The `dev-servers` skill has the recipe.

### `toBeDefined()` passes for `null`

Prisma's `findFirst` returns `null` when nothing matches, and `expect(null).toBeDefined()`
passes. The test then fails later, where something dereferences the row. Use
`expect(row).not.toBeNull()` for a row that must exist and `expect(row).toBeNull()` for one
that must not. When a change should stop writing something, assert the absence explicitly.
Otherwise nothing distinguishes "correctly skipped" from "never worked".

### Assert a classification is exhaustive

Where code enumerates a domain, such as every policy action or every access type, walk the
registry and assert both directions:

```js
expect(unclassified).toEqual([]);   // registered but not in either list
expect(phantom).toEqual([]);        // in a list but not registered
```

The first catches an action nobody classified. The second catches a hand-written entry for an
action that does not exist. A naming convention is no substitute, because it fails silently
for whatever somebody adds next.

### A forcing check outlives its feature

A test that counts the interesting cases in its data, and fails when the count is zero, stops a
suite passing vacuously. When the feature stops existing, the count becomes zero by
construction.

`tests/model/listRowsArm.test.js` counts rows that lose a capability to a restriction. The
restriction checker now allows everything, so no world can produce such a row. The test
asserts `restricted` is exactly 0, says why in a comment, and names
`tests/authorization/restrictionSeam.test.js`. That suite injects a blocking checker, so the
property is still tested somewhere. Deleting the line would leave a reader unable to tell
whether the case was retired or forgotten.

When a layer becomes a no-op, grep its tests for `toBeGreaterThan(0)` before running them. Each
hit is either a property that moved, which should say where, or one that is gone.

### Pin a reversal with tests

When a rule is removed because it was wrong, deleting its test file leaves nothing behind. The
next reader of the review that argued for the rule sees a gap and fills it. The suite stays
green while the reversal is undone.

Replace the deleted suite with one that asserts the new freedom directly.
`tests/services/grants/derivedIndependence.test.js` is the example. It grants a derivative to
`Public` while its source stays scoped, walks a chain and several sources, and checks the
reverse direction. Its header says it pins a reversal and names the decision. A constraint
that was considered and declined deserves the same, because an absence no test asserts looks like
an oversight.

## Fixtures and setup

### Grants accumulate across tests

Several suites grant to the same subject and resource in test after test. Through the
access-type order, a `DATASET:DOWNLOAD` grant left by one test covers a later test's
`DATASET:LIST_FILES` request. The approval then writes nothing, and the later test fails on a
premise the earlier test destroyed. Clear grants for the resource between tests:

```js
afterEach(async () => {
  await prisma.grant.deleteMany({ where: { resource_id: dataset.resource_id } });
});
```

Fixtures have the same shape. `prisma.grant_access_type.findMany({ take: 3 })` returns
`VIEW_METADATA`, `VIEW_SENSITIVE_METADATA`, and `LIST_FILES`. The last two both imply the first,
so a preset built from them collapses to one grant. When a test needs access types that behave
independently, name pairwise incomparable ones: `DATASET:VIEW_SENSITIVE_METADATA`,
`DATASET:DOWNLOAD`, and `DATASET:LIST_DERIVED_DATASETS`.

@see docs/design/groups/decisions.md — 7. Access types imply one another

### Count assertions that the access-type order can absorb

A test issuing ten distinct access types concurrently cannot assert ten rows. Distinct is not
independent. Whichever transaction commits second may find the first already covering it and
write nothing. The count is then nine or ten depending on commit order. Assert what ordering
cannot change. Expand the written grants through the closure and check every requested type
is held, as `issueGrants.concurrency.test.js` does:

```js
const held = await expand(live.map((g) => g.access_type.name));
for (const type of types) expect(held.has(type.name)).toBe(true);
```

### Seed the state a guard prevents

A guard on the write path cannot be set up through that write path. For example, a test of the
derived-openness check needs a private dataset's grandchild. Making the middle dataset public
is refused by the rule under test.

Write the invalid state straight to the table with `prisma.<model>.create`, then exercise the
guard. The state is reachable in a running system, because these checks run when something is
issued and the world changes afterwards. Name that real sequence in a comment. A setup step
refused by the code under test deserves a second look first. Sometimes the rule is working and
the scenario is wrong.

### Membership helpers

`tests/services/helpers.js` holds the fixtures. `group_user` has no composite key, and a user
may hold several memberships of one group over time. Two helpers reflect that:

- `activeMembership(group_id, user_id)` returns the open row, or null.
- `membershipHistory(group_id, user_id)` returns every row, open and closed.

A lookup by `group_id_user_id` targets a key that does not exist.

`createTestGroup(actorId)` does not make the actor an admin. A test that needs one adds a row:
`prisma.group_user.createMany({ data: [{ group_id, user_id: subject_id, role: 'ADMIN' }] })`.

### `__basedir` counts from the test file

Every test opens with `global.__basedir = path.join(__dirname, '..', '..')`. That is correct
only for a file directly under `tests/services/`. A file in `tests/services/datasets/` needs
three `..` segments.

The mistake is silent for most tests. `src/services/auth.js` reads the JWT key with
`fs.readFileSync(path.join(global.__basedir, ...))` at import time. A suite that never imports
the auth middleware passes with the wrong value. Importing `@/services/dataset` is enough to
pull it in, and then the suite fails to run with `ENOENT: tests/keys/auth.key`.

### Identifiers that must not resolve

`00000000-0000-0000-0000-000000000000` is the seeded Authenticated Users group. A test that
expects a 404 for it creates a row instead. `ffffffff-0000-4000-8000-000000000001` is the
seeded Unassigned Datasets group, and the other `ffffffff` ids in `src/constants.js` are seeded
too. Use `randomUUID()` for an identifier that must not resolve.

### Archive through the service

Call `groupsService.archiveGroup(group_id, actor_id)` rather than writing `is_archived`. The
service runs in a transaction, checks the group's state with `assertPossible`, sets
`archived_at`, and writes a `GROUP_ARCHIVED` audit record. A direct column write skips all
three. Collections follow the same rule. Give every helper-created group a distinctive tag, so
a leaked row is identifiable by name.

### Dataset rows

`src/services/dataset.js` (v1) and `src/services/datasets_v2/create.js` each export a
`buildDatasetCreateQuery`. The `/datasets` routes import `@/services/dataset`. The
`/v2/datasets` routes import `@/services/datasets_v2`. Check which module a route imports
before changing dataset creation.

Do not call the v1 `datasetService.create` only to get a dataset row. It runs
`_handle_project_association`, which consults the `auto_create_project_on_dataset_creation`
feature flag and a v1 permission lookup. For a plain `user` that lookup returns `undefined`,
and the service throws `Cannot read properties of undefined (reading 'granted')`. Build the
query with `buildDatasetCreateQuery` and pass it to `prisma.dataset.create`. Supply
`owner_group_id` and `resource_id`, because both are `NOT NULL`.

### Raw queries on `grant`

`prisma.$queryRaw` on `SELECT * FROM "grant"` throws "Failed to deserialize column of type
'tsrange'". The raw client does not support the `valid_period` column. Name the columns.

## Modules that hold resources

### The SSE manager keeps Jest alive

`src/notification/inApp/sseManager.js` opens two Redis connections when the module loads. That
is right for a server process and wrong for a test. Any suite that creates a notification pulls
the module in and never exits. Call `sseManager.shutdown()` in `afterAll`, as
`tests/services/access-requests/access-request.notifications.test.js` does. Delivery is
best-effort, so shutting down is safe at any point.

### `mjml` fails in teardown

`renderTemplate` in `src/notification/email/templateRenderer.js` requires `mjml`, which uses a
dynamic import. Under Jest that needs `NODE_OPTIONS=--experimental-vm-modules`. Without it the
suite reports every test passing and then "Test suite failed to run". The failure appears only
in a full run.

Turning the flag on for the whole project changes how every suite runs. A CI job that invokes
`jest` directly would not pick it up either. Compile the Handlebars source instead: read the
`.hbs` file and pass it to `handlebars.compile`, as
`tests/services/invitations/invitation.email.test.js` does. That isolates Handlebars'
auto-escaping of values such as a group name. Check the mjml conversion end to end against
MailHog.

### `jest.spyOn` cannot intercept a call a module makes to itself

`jest.spyOn(service, 'fn')` replaces the property on the exports object. A caller inside the
same module holds the original binding. The spy never fires, and the real function runs. Here
that means a live call to the workflow service, which fails with a 401. The symptom is
plausible-but-wrong values while the spy reports zero calls.

There are two ways out:

- Inject the collaborator as an argument with a default. `bulkStage` in
  `src/services/datasets_v2/workflows.js` takes `permits` and `startRun` this way.
- Spy on a boundary the module genuinely crosses, such as `wfService.getAll` or
  `prisma.workflow.findMany`.

Prefer injection when the function's job is to decide something. The decision stays testable
without a database or a network.

## The model suites

The UI has no test runner. `tests/model/uiScan.test.js` and `tests/model/badgeCoverage.test.js`
run in the API suite and read `ui/src` as text. An allowlist entry that matches nothing fails
the scan, so delete an entry when its line goes.

After changing a policy container, run `node tests/model/generateDecisionTable.js` directly.
The `npm run model:table` wrapper once failed inside a chained background command while the
direct call succeeded. The cause is not known.

### Operation sequences

`tests/model/operationSequences.test.js` drives random command sequences with fast-check
`fc.commands` and `fc.asyncModelRun`. Each run builds a small world through the services. It
reads that world back into the reference model's shape as the starting model. After every
command it runs two checks. The database must equal the model, including memberships, grants,
collection contents, archived columns, deletions, and group settings. The engine must decide
the same as `createReference` for every user and resource.

- `MODEL_SEQUENCE_RUNS` (default 30), `MODEL_SEQUENCE_COMMANDS` (default 25), and
  `MODEL_SEQUENCE_SEED` set the budget and replay a seed. A run of 6 sequences of 12 commands
  takes about 11 seconds, and 30 of 25 takes about 51 seconds.
- `fc.commands` takes `size: 'max'`. Without it, sequences stay short, and a removed archived
  guard can survive 30 runs undetected.
- Count command kinds inside `Command.run`. `fc.commands` iterates wrapper objects, so
  `constructor.name` over them reports one kind.
- A group's parent is the `group_closure` row at depth 1. The `group` table has no parent
  column, and a snapshot that reads one flattens the tree.
- The suite counts refused commands and fails when none ran, because a run with no refusal
  never reached a guard.
- Two operations-table cells sit outside the suite. The profile cache lifetime is in
  `tests/routes/public.cache.test.js`. The owner-change refusal is in
  `tests/authorization/route_policy_bindings.test.js`.

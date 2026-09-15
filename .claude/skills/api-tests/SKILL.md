---
name: api-tests
description: Operational technique for the api/ Jest suites - how they use the real database, how to tell a failure you caused from one that was already there, the git stash trap that must never be repeated, why the concurrency suites need their own timeout, and why a race can be rejected two different ways. Use when running or writing anything under api/tests, or when a change makes tests fail and the cause is not obvious.
---

# Running and fixing the API tests

```
cd api
npx jest --runInBand                       # everything
npx jest --runInBand tests/services/groups # one directory
```

A backgrounded run inherits the **session** working directory, not the one a previous
command `cd`-ed into. Started from the repository root, `npx jest` picks up the root config
and tries to run the UI and e2e suites too: 102 suites "fail" while 0 tests fail, because
they failed to *run*. Read the `Tests:` line before the `Suites:` line — `0 failed` with a
wall of red suites means the invocation was wrong, not the code. Put the `cd api` in the
same command.

A foreground call has the same trap. The Bash tool keeps the directory a previous call `cd`-ed
into, so after a UI command jest reports `No tests found` and names `.../bioloop/ui` as the
directory it searched. The pattern is fine; the directory is wrong.

`--runInBand` is not optional. The service suites talk to a **real database** and the
concurrency suites deliberately race transactions against real constraints. Running them in
parallel produces failures that mean nothing.

## The suites run against `app_test`, not the development database

Jest's `setupFiles` loads `api/tests/testDatabase.js`, which sets `DATABASE_URL` to
`<DATABASE_DB>_test` on the same server (`app_test` on `localhost:5433` here) before anything
opens a Prisma client. `src/db.js` loads `.env` through dotenv-safe, which never overrides a
variable already set, so the override holds. The running API and the browser keep the
development database, and suites no longer see rows a person created by clicking around.

- **Create and seed it once:** `CREATE DATABASE app_test` as the `.env` user, then
  `npm run test:db:setup`, which runs `prisma migrate deploy` and `prisma db seed` against it.
  Run the same script after adding a migration.
- **Resetting it is a person's step.** Prisma refuses `prisma migrate reset` when an AI agent
  invokes it, and demands consent given in a message sent after the refusal. An earlier
  "you may reset the database" does not count. Do not set
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` yourself, and do not drop the database by
  another route to get around it; ask.
- **Two suites still reach the development database:** `tests/routes/health.test.js` and
  `tests/routes/auth/singup.test.js` call the running API on port 3030 through `tests/request.js`.
- A standalone script that requires `@/db` outside jest reaches the **development** database
  unless it requires `tests/testDatabase.js` first.

## Never use `git stash` to get a baseline

This cost a session once and must not happen again.

`git stash push -- <paths>` resolves paths against the current working directory. Run from
`api/` with repository-relative paths, it fails with
`pathspec ':(prefix:4)api/api/src' did not match any file(s)` — **and creates no stash**. If
the next command in the chain is `git stash pop`, it pops whatever unrelated stash the user
already had, dropping their work-in-progress into your tree as a merge conflict.

Two rules follow.

- Never pair a `stash push` and a `stash pop` in one command chain. `&&` does not protect
  you, because the failing `git` is upstream of a `tail` in a pipeline and the pipeline
  still exits 0.
- Run `git stash list` before any pop, and confirm the top entry is the one you just made.

To get a genuine before-and-after baseline, use a worktree instead:

```
git worktree add /tmp/baseline HEAD
```

Pure unit suites — anything under `tests/authorization/core` — need no database and run
there directly. Service suites do not, because the worktree would share the migrated
database with your branch.

## Restoring a file you mutated on purpose is where the run gets stuck

Checking that a new test actually fails without its fix means breaking the fix, running the
test, and putting it back. The putting-back is the step that goes wrong.

`cp` is interactive in this environment. `cp /tmp/keep.js src/....js` asks
`overwrite src/...? (y/n [n])`, and a prompt inside a tool call that has already been moved
to the background waits forever — leaving the mutated file in the tree, which is the worst
possible place to stop.

Restore with the same edit script run in reverse, or with `cp -f`. Either way, put the
restore in its own call rather than chaining it after a jest run that may outlive the
foreground timeout, and confirm with `git diff` that only the intended change is left.

## Telling your failure from an existing one

Before assuming a failure is yours, check the cheap signals in this order.

1. `git status` — did you touch anything in that area at all? A suite failing under
   `tests/authorization/core` after a change confined to `src/services` is almost never
   yours.
2. Read the error rather than the test name. `X is not a constructor` and
   `X is not a function` are import-name drift, not behaviour.
3. Run the suite alone, then run it several times. A concurrency suite that fails once in
   six identical runs is telling you about a race in the test, not about your change.
4. Check the API is actually up. The route suites (`tests/routes/`) call the running
   server, and a wall of bare `AggregateError` with no message is a refused connection, not
   a behaviour change. `bin/devserver.sh status` reports the **nodemon** process, which
   stays alive after the app inside it crashes — read `logs/api.log` or check the listening
   port instead. A `prisma migrate reset` crashes the API mid-run, because access types
   briefly do not exist; restart it after the reset finishes.

## Known-stale patterns this repository has already hit

The ABAC work renamed things without updating tests, so these shapes recur:

- **Class renames.** `Hydrate` became `Hydrator`; `PrismaHydrate` became `PrismaHydrator`.
  A whole suite fails at `extends undefined`.
- **Consolidated functions.** `authorize()` was folded into `authorizeWithFilters()`, which
  returns `{ granted, filter }` rather than a bare boolean and validates `attributeRules`
  before anything else. Retargeted calls need `attributeRules: []`.
- **Identifier changes.** The authorization middleware identifies a caller by
  `user.subject_id`, not the numeric `user.id`. Tests written before that still pass
  `{ id: 77 }`.
- **Argument shapes.** `listPresets({ resource_type })` takes an object. A test passing
  `listPresets('DATASET')` destructures to `undefined` and silently drops the filter. Every
  seeded preset is now scoped to collections, so the dropped filter is easy to miss:
  `listPresets('DATASET')` returns both collection presets, where the correct call returns
  none.

In each case the production code was right and the test was stale. Check the caller in
`src/routes` before changing either.

## The concurrency suites need their own timeout

Every test that calls `runRace()` does `RACE_RUNS` (8) sequential iterations, each
provisioning fixtures, firing several concurrent writes, and tearing down. That is well
past Jest's 5 second default, so these tests pass against a warm database and time out
against a cold one — which is what a `prisma migrate reset` leaves behind.

The `beforeAll` hooks always had explicit timeouts; the `it` blocks did not. Each
concurrency file now calls `jest.setTimeout(RACE_TIMEOUT_MS)`, exported from
`tests/services/concurrency-utils.js` and derived from `RACE_RUNS`, so raising the run
count from the environment raises the budget with it.

A new file under `tests/services/<area>/*.concurrency.test.js` needs the same line. A race test
that times out is almost always this and not a hang.

## A race can be rejected two ways, and both are correct

Two transactions that revoke and recreate a grant for the same
(subject, resource, access_type) contend for the `grant_no_overlap` exclusion constraint.
Postgres resolves that either by raising the constraint violation, which the service turns
into a 409, or — when the two took their locks in opposite orders — by breaking the
circular wait with a deadlock, Postgres error code `40P01`. Which you get depends on timing.

Exactly one transaction commits either way, and that is the invariant these tests exist to
check. A test that asserts on the constraint wording, or on `reason.status === 409`, passes
or fails depending on which resolution Postgres happened to pick. `RACE_REJECTION_PATTERN`
in `tests/services/concurrency-utils.js` accepts both, and a status assertion should read
`expect([409, undefined]).toContain(status)` because a deadlock arrives as a raw Prisma
error with no HTTP status on it.

This was the cause of both suites that used to be listed here as flaky. If a race test
starts failing intermittently, check for this shape before assuming the timing is
unfixable — eight consecutive runs of a suite is a reasonable bar for calling it settled.

## Cover the shape a caller actually gets back

Two bugs in one session came from testing a function's logic and not its return shape.
`evaluateCapabilitySet` returns a map of action name to boolean, not a list, and code
written against it as a list threw `capabilities is not iterable` on the first real request
while every unit test passed.

When you wrap or filter something the request path uses, assert on the shape the caller
receives, not only on the values. A quick check before writing the wrapper:

```
node -e "global.__basedir=process.cwd(); require('module-alias/register');
  const x = require('@/some/module'); console.log(typeof x.thing, x.thing)"
```

The route tests under `tests/routes/` need an authenticated session, which is why the
service suites do not cover the middleware. Until that scaffolding exists, exercise the
page in a browser after a middleware change — the `dev-servers` skill has the recipe.

## Assert a classification is exhaustive, not just correct

Where code enumerates a domain — every policy action, every access type, every restriction
type — write the test that walks the registry and asserts nothing is missing and nothing
listed is fictional:

```js
expect(unclassified).toEqual([]);   // registered but not in either list
expect(phantom).toEqual([]);        // in a list but not registered
```

Both halves matter. The first caught a real action nobody had classified, which would have
escaped every restriction; the second caught a hand-written entry for an action that does
not exist. A naming convention is not a substitute, because it fails silently for whatever
somebody adds next.

## To test a guard, seed the state it prevents

A guard that runs on the write path cannot be set up through that write path. Building the
"grandchild of a private dataset" case for the derived-openness check failed at first
because the setup step — making the middle dataset public — was itself refused by the rule
under test.

Write the invalid state straight to the table with `prisma.<model>.create`, then exercise
the guard. That is not cheating: the state is reachable in a running system, because these
checks run when something is issued and the world changes afterwards. Say which real
sequence produces it, in a comment, so the next reader does not take the seeded row for a
shortcut.

A setup step being rejected by the code under test is worth a second look before you fix
the test. It sometimes means the rule is working and the scenario was wrong.

## Test helpers

`tests/services/helpers.js` holds the fixtures. Two membership helpers matter, because
`group_user` has no composite key and a user may hold several memberships of one group over
time:

- `activeMembership(group_id, user_id)` — the open row, or null. Use for "is this user a
  member now?".
- `membershipHistory(group_id, user_id)` — every row, open and closed. Use to assert that
  history survived a removal.

A test that looks up a membership by `group_id_user_id` is written against a key that no
longer exists.

## `__basedir` counts from the test file, not from `tests/`

Every test opens with

```js
global.__basedir = path.join(__dirname, '..', '..');
```

which is correct only for a file directly in `tests/services/`. A file one level deeper, such
as `tests/services/datasets/`, needs three `..` or `__basedir` lands on `tests/` instead of
the `api/` root.

The mistake is silent for most tests. `__basedir` is read by `src/services/auth.js`, which
does `fs.readFileSync(path.join(global.__basedir, config.get('auth.jwt.key')))` at import
time. A suite that never pulls in the auth middleware passes with the wrong value. The moment
one does — importing `@/services/dataset` is enough, since it requires `src/middleware/auth`
— the whole suite fails to run with `ENOENT: tests/keys/auth.key`.

Count the directories rather than copying the line from a neighbouring test.

## Two `buildDatasetCreateQuery` functions exist, and only one is wired up

`src/services/dataset.js` (v1) exports the one the routes call. `POST /datasets` and
`POST /datasets/bulk` both go through it. `src/services/datasets_v2/create.js` has a second,
tidier copy that it does not export; nothing outside that file calls the v2 creation path at
all. Editing the v2 copy changes nothing a route does, and no test catches it, because the
v2 module still loads and still passes its own tests.

Before changing dataset creation, check which module the route imports. `src/routes/datasets/index.js`
imports `@/services/dataset`, not `@/services/datasets_v2`.

## Do not call `datasetService.create` just to get a dataset row

The v1 `create` runs `_handle_project_association`, which for a requester with no projects
consults the `auto_create_project_on_dataset_creation` feature flag and then
`getPermission({ resource: 'projects', action: 'create' })`. That call returns `undefined`
for a plain `user`, so the service throws `Cannot read properties of undefined (reading
'granted')` before it returns.

A test that needs a dataset row and not the legacy project machinery should build the query
with `buildDatasetCreateQuery` and hand it to `prisma.dataset.create` directly. Supply
`owner_group_id` and `resource_id`, because both are `NOT NULL` and the route sends neither.

## Pin a reversal with tests, do not just delete the old ones

When a rule is removed because it was wrong rather than merely unwanted, deleting its test
file leaves nothing behind. The next person to read the review that argued for the rule sees
a gap and fills it, and the suite stays green while the reversal is undone.

Replace the deleted suite with one that asserts the new freedom directly. For the derived
dataset rule this meant `tests/services/grants/derivedIndependence.test.js`, which grants a
derivative to `Public` while its source stays scoped, walks a chain and several sources, and
checks the reverse direction too. Say in the file header that it pins a reversal and name the
decision, so its purpose is legible without the history.

The same applies to a constraint that was considered and declined. An absence nobody asserted
is indistinguishable from an oversight.

## The all-zeros UUID is a real group

`00000000-0000-0000-0000-000000000000` looks like the obvious "definitely does not exist"
identifier and it is the seeded **Authenticated Users** group. A test asserting that an
unknown group is a 404 passed the check and created the row instead, which then failed on
something unrelated three assertions later. Use `randomUUID()` for an identifier that must
not resolve. The same caution applies to `ffffffff-0000-4000-8000-000000000001`, which the
restriction suite treats as a real seeded group.

## Archive a group through the service, never by writing `is_archived`

`group.is_archived` and `collection.is_archived` are denormalisations of an open `ARCHIVED`
restriction, written in the same transaction, and
`tests/services/restrictions/restrictions.test.js` asserts the column and the restriction
table agree across every row in the database. A test that sets the column directly leaves a
group that satisfies neither side, and the failure surfaces in that unrelated suite rather
than in the test that caused it — and it persists, because the row outlives the run whenever
cleanup swallows its error.

Call `groupsService.archiveGroup(group_id, actor_subject_id)`. It is a transaction and it
writes both. The same goes for collections.

Two habits that make this recoverable: give every helper-created group a distinctive tag so a
leaked row is identifiable by name, and when the invariant suite fails, read the ids it
reports rather than the assertion — the set difference names the exact rows to delete.

## Do not pull `mjml` into a jest suite

`renderTemplate` in `src/notification/email/templateRenderer.js` requires `mjml`, which uses
a dynamic import. Under jest that needs `NODE_OPTIONS=--experimental-vm-modules`, and without
it the suite reports **every test passing and then "Test suite failed to run"** — a confusing
shape, because the failure is in teardown rather than in an assertion. It also only appears
in a full run; the file passes on its own.

Turning the flag on for the whole project to accommodate one file is the wrong trade: it
changes how every suite runs for everyone, and a CI job that invokes `jest` directly rather
than through `npm test` would not pick it up and would fail there instead.

Compile the Handlebars source directly instead — read the `.hbs` file and `handlebars.compile`
it. That isolates the part worth unit-testing, which is Handlebars' auto-escaping of
attacker-supplied values such as a group name, from the mjml conversion. Check that the result
survives mjml end to end against MailHog, where the worker does it for real.

## `toBeDefined()` passes for `null`, so it asserts almost nothing here

Prisma's `findFirst` returns `null` when nothing matches, and `expect(null).toBeDefined()`
passes. A test written as

```js
const g = await fetchActiveGrant(viewMetaId);
expect(g).toBeDefined();          // passes even when no grant exists
```

only fails later, where something dereferences `g.valid_until`. Several grant tests were
silently weak this way, and the weakness surfaced as a confusing partial failure when the
write path changed.

Use `expect(g).not.toBeNull()` for a row that must exist, and `expect(g).toBeNull()` for one
that must not. Assert the absence explicitly whenever a change is supposed to stop writing
something — otherwise nothing distinguishes "correctly skipped" from "never worked".

## Grants accumulate across tests, and the access-type order makes that order-dependent

Several suites grant to the same subject and resource in test after test with no cleanup
between. That was harmless while every access type was independent. It is not harmless now:
a `DATASET:DOWNLOAD` grant left by one test covers a later test's `DATASET:LIST_FILES`
request through the access-type order, the approval writes nothing, and the later test fails
on a premise the earlier test destroyed.

Add an `afterEach` that clears grants for the resource when a suite grants repeatedly to one
subject:

```js
afterEach(async () => {
  await prisma.grant.deleteMany({ where: { resource_id: dataset.resource_id } });
});
```

The same shape bites fixtures. `prisma.grant_access_type.findMany({ take: 3 })` returns
`VIEW_METADATA`, `VIEW_SENSITIVE_METADATA`, and `LIST_FILES`, and the last two both imply
the first — so a preset built from them collapses to one grant and every expansion,
deduplication, and supersession case has nothing to act on. When a test needs several access
types to behave independently, name pairwise incomparable ones explicitly:
`DATASET:VIEW_SENSITIVE_METADATA`, `DATASET:DOWNLOAD`, and `DATASET:LIST_DERIVED_DATASETS`.

@see docs/design/groups/decisions.md — 7. Access types imply one another

## Count assertions become order-dependent when the order can absorb a row

`supports 10 concurrent non-overlapping access_type issues` asserted ten rows for ten distinct
access types. Distinct is not independent: whichever transaction commits second finds the
first already covering it and writes nothing, so the row count is nine or ten depending on
commit order. It failed roughly one full run in two, which reads as flake rather than as a
wrong assertion.

Assert what does not depend on ordering. Expand the written grants through the closure and
check every requested type is held:

```js
const held = await expand(live.map((g) => g.access_type.name));
for (const type of types) expect(held.has(type.name)).toBe(true);
```

## A finished run can look hung, because jest does not exit

After the last suite, jest prints `Test Suites: ...` and then `Jest did not exit one second after
the test run has completed`. The Redis and SSE clients the services open stay connected, so the
process idles at 0% CPU until something kills it. That looks exactly like a stalled test, and one
session killed three finished runs before reading their output.

Write the output straight to a file, and look for the `Test Suites:` line before deciding a run is
stuck. Piping jest through `grep` buffers everything until the process exits, which it never does.
Pass `--forceExit` when the run should end on its own. Before starting a run, check
`ps -eo pid,etime,args | grep "[j]est --runInBand"` and stop runs that already printed a summary.

## A single failure in a full run is usually cross-suite interference

Four consecutive full runs on 2026-09-09 produced three different single-test failures and
one clean run, in `issueGrants.concurrency`, `coverage`, and `auth.invite`. Each one passed
on a targeted rerun of its own file, several times over. At the time the suites shared the
development database with the running API. They now share `app_test` only with each other,
so interference between suites remains possible and interference from clicking around does not.

So the order is: rerun the failing file alone, then rerun it a few times. Only if it fails
there is it worth reading as a defect. Going the other way — assuming a full-run failure is
real and editing the code — costs a session. The standing instances are filed in
`.todo/local/misc-carryover.md`.

The exception is a failure that is *reproducible* in a full run and absent from a targeted
one, which points at real shared state rather than at timing. The concurrency count
assertion above was exactly that, and it was a genuine bug in the assertion.

## Fixtures and raw queries that do not do what they look like

- `createTestGroup(actorId)` does not make the actor an admin. A test that needs one adds a row:
  `prisma.group_user.createMany({ data: [{ group_id, user_id: subject_id, role: 'ADMIN' }] })`.
  `relatedLineage.test.js` first failed with both admins refused for this reason.
- `prisma.$queryRaw` on `SELECT * FROM "grant"` throws "Failed to deserialize column of type
  'tsrange'". The `valid_period` column is unsupported by the raw client. Name the columns.
- The UI has no test runner. `tests/model/uiScan.test.js` and `tests/model/badgeCoverage.test.js`
  run in the API suite and read `ui/src` as text. A scan allowlist entry that matches nothing
  fails the scan, so delete an entry when its line goes.
- Run `node tests/model/generateDecisionTable.js` directly after changing a policy container. The
  `npm run model:table` wrapper once failed inside a chained background command while the direct
  call succeeded; the cause was not isolated.

## Keeping this current

When a session hits a failure this page does not explain — a new stale pattern, a suite that
turns out to be order-dependent, a helper that was missing — amend this file in the same
change. Record dead ends explicitly, and confirm a claim by running the suite before writing
it down here.

## `jest.spyOn` cannot intercept a call a module makes to itself

`jest.spyOn(service, 'fn')` replaces the property on the exports object. A caller inside the
same module holds the original binding, so the spy never fires and the real function runs —
which in this codebase means a live call to the workflow service, failing with a 401 that
looks nothing like the mistake.

The symptom is a test whose assertions fail with plausible-but-wrong values while the spy
reports zero calls.

Two ways out. Inject the collaborator as an argument with a default, which is what
`bulkStage` does for both its permission check and its run starter, so a test drives the
outcomes without any service at all. Or, when injection would distort the design, spy on the
boundary the module genuinely crosses — `wfService.getAll`, `prisma.workflow.findMany` —
rather than on its own sibling function.

Prefer injection when the function's job is to decide something. It keeps the decision
testable without a database or a network, and it makes the collaborators visible in the
signature.

## A 30-second test is an external service, not your change

`tests/services/imports/dataset.import.test.js` failed three of six tests on 2026-09-10,
reproducibly, three isolated runs in a row. Every failure was Jest's 5-second timeout rather
than a wrong answer, and all six passed under `--testTimeout=60000` with the two slow tests
taking **30.4 and 30.5 seconds each**.

The shape identifies it. Exactly the two tests that reach `createWorkflow` were slow; the
four that refuse before it were 4–18ms. The third failure was collateral — a later test read
the dataset the first one never managed to create and died on `Cannot read properties of
null`. Around 30 seconds, on the only calls that leave the process, is an external service
that accepts the connection and does not answer.

It recovered on its own with no code change: the same suite ran 79ms and 36ms half an hour
later, three times at the default timeout, and the full suite went back to green. The docker
stack had been started shortly before, so rhythm was most likely still coming up.

**Do not go looking for the bug before checking that the clock is round.** A test whose
duration is 5s (the Jest limit) or a multiple of 10 is reporting a timeout somewhere, not a
defect. Re-run with `--testTimeout=60000` first: if it passes and prints a round number, the
number is the answer. Chasing this one cost most of an hour and produced no code change.

The measurement worth taking, if it happens again, is a timing probe of each `await` in the
service — written to the scratchpad, never into `api/`, and run with the alias registered by
hand so the module resolver finds `@/`:

```js
require('<abs path>/api/node_modules/module-alias').addAlias('@', '<abs path>/api/src');
```

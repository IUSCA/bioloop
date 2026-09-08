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

`--runInBand` is not optional. The service suites talk to the **real development database**
on `localhost:5432` and the concurrency suites deliberately race transactions against real
constraints. Running them in parallel produces failures that mean nothing.

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
  `listPresets('DATASET')` destructures to `undefined`, silently drops the filter, and only
  fails once the seed data contains more than one kind of row.

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

## Keeping this current

When a session hits a failure this page does not explain — a new stale pattern, a suite that
turns out to be order-dependent, a helper that was missing — amend this file in the same
change. Record dead ends explicitly, and confirm a claim by running the suite before writing
it down here.

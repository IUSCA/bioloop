---
name: api-tests
description: Operational technique for the api/ Jest suites - how they use the real database, how to tell a failure you caused from one that was already there, the git stash trap that must never be repeated, and the suites that are known stale or flaky. Use when running or writing anything under api/tests, or when a change makes tests fail and the cause is not obvious.
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
3. Run the suite alone. Several concurrency suites pass in isolation and fail in a full
   run.

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

## Known flaky

`tests/services/grants/grants.concurrency.test.js` intermittently fails in a full run with
`deadlock detected` from Postgres, and passes every time in isolation. The race is real —
two transactions contending for the same exclusion constraint — and a deadlock is a valid
way for Postgres to resolve it. The test asserts on a conflict message and does not accept
a deadlock as one. Not yet fixed.

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

## Keeping this current

When a session hits a failure this page does not explain — a new stale pattern, a suite that
turns out to be order-dependent, a helper that was missing — amend this file in the same
change. Record dead ends explicitly, and confirm a claim by running the suite before writing
it down here.

---
name: api-tests
description: Operational technique for the api/ Jest suites - the commands and flags that work, the git stash trap that must never be repeated, how to tell a failure you caused from one that was already there, and the fixture and assertion traps that make a test pass while asserting nothing. Use when running or writing anything under api/tests, or when a change makes tests fail and the cause is not obvious.
---

# Running and fixing the API tests

The reasoning and worked examples behind every rule here are in
`docs/contributing/techniques/api-tests.md`. Read it when a rule below needs explaining.

## Invoking Jest

```sh
/Users/.../bioloop/api/node_modules/.bin/jest --runInBand --forceExit \
  /Users/.../bioloop/api/tests/services/groups > /abs/scratchpad/jest.out 2>&1
```

- **`--runInBand` is required.** The suites use a real database and race real transactions.
- **Absolute paths for the binary, every file argument, and the output file.** The shell's
  cwd drifts between calls, and parallel calls leave it wherever the last one landed. Started
  from the repo root, Jest runs the UI and e2e suites too: ~100 suites "fail" with
  `Tests: 0 failed`. Started from `ui/`, it prints `No tests found`. In the background it exits
  127 with one line of shell error, which looks like a finished run.
- **`cd api` first, even with absolute paths.** `config` reads `<cwd>/config`, so a run started
  from the repo root loads no configuration. One suite that requires `config` then fails to run
  with `Test Suites: 1 failed` and `Tests: 0 total`, under a wall of
  `WARNING: NODE_ENV value of 'test' did not match any deployment config file names`. Nothing
  says the path was wrong.
- **Read the first line of the output before the summary.** A shell error means no results.
- **A file argument that matches nothing is skipped silently** when another argument matches.
  Run `ls` on the arguments, or check the suite count in the summary against what you meant.
- **Never pipe Jest through `grep`.** The pipe buffers until exit, and the exit code is grep's.
- **Jest does not exit after a run.** Redis and SSE clients stay open, so a finished run idles
  at 0% CPU and looks hung. Pass `--forceExit`. Look for `Test Suites:` in the output file.
  Before starting, check `ps -eo pid,etime,args | grep "[j]est --runInBand"` and stop finished runs.
- **Revert experiments go in a script file run with `bash file.sh`.** The Bash tool's zsh
  profile aliases `cp` and `rm` to `-i`, and does not word-split `$VAR`.
- **Never run this suite and the Playwright suite at the same time.** `tests/routes/` calls the
  running API, which reads the development database, and the e2e suite rewrites it. Measured
  2026-09-17: run together, eight grant tests failed on grants that should have been effective
  and four e2e tests failed, three of them as sign-in timeouts. Run alone, both were green at
  119 suites and 55 tests. Nothing was wrong with either change.

## The test database

- Suites run against `app_test`, not the development database. `tests/testDatabase.js` sets
  `DATABASE_URL` through Jest's `setupFiles`.
- **After adding a migration, run `npm run test:db:setup`** from `api/`. It runs
  `migrate deploy` and `db seed` against `app_test`.
- **A reset needs the user's consent.** Prisma refuses `migrate reset` from an agent. Ask in
  its own question, after the refusal. Never set `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`
  without that message, and never drop the database another way.
- `tests/routes/health.test.js` and `tests/routes/auth/singup.test.js` call the running API on
  port 3030, which reads the development database.
- A standalone script requiring `@/db` hits the development database unless it requires
  `tests/testDatabase.js` first.
- **`logs/api.log` fills with dataset 404s while the suites run, and they are not yours.** A
  suite that starts a workflow enqueues a real Celery task, and the worker then asks the
  running API for a dataset that only ever existed in `app_test`. Each 404 logs a full Prisma
  stack at `[ERROR]`. See `.todo/local/L6-verification-and-e2e-gaps.md` T16.

## Never use `git stash` to get a baseline

This cost a session and must not happen again. `git stash push -- <paths>` resolves paths
against the cwd. From `api/` with repo-relative paths it fails with
`pathspec ':(prefix:4)api/api/src' did not match` and **creates no stash**. A following
`git stash pop` then pops the user's unrelated stash into the tree as a merge conflict.

- Never pair `stash push` and `stash pop` in one command chain. `&&` does not help when the
  failing `git` feeds a pipeline, which still exits 0.
- Run `git stash list` before any pop and confirm the top entry is yours.
- For a baseline, use `git worktree add /tmp/baseline HEAD`. Only pure unit suites such as
  `tests/authorization/core` run there, because service suites share the database.

## Restoring a file you broke on purpose

`cp` prompts before overwriting, and a prompt in a backgrounded call waits forever with the
mutated file left in the tree. **`cp -f` is not enough**: the profile's `cp -i` alias still
wins, and the call answers itself with `not overwritten`, which reads like success. Restore with
`/bin/cp -f` or the reverse edit, in its own call, not chained after a Jest run. Confirm with
`git diff`.

## Is the failure yours?

Check in this order before editing code:

1. `git status`. A failure far from your change is rarely yours.
2. The error text. `X is not a constructor` or `is not a function` is import-name drift.
   Known stale shapes: `Hydrate` -> `Hydrator`, `authorize()` -> `authorizeWithFilters()`
   (needs `attributeRules: []`), `user.id` -> `user.subject_id`, and
   `listPresets({ resource_type })` taking an object. The production code is usually right.
3. **Rerun the file alone three or four times and report the counts.** A failure that
   reproduces every time, in the full run and alone, is a real defect. Start there: measured
   2026-09-17 over eight full runs, nothing failed intermittently. Five runs before a fix gave
   the identical result each time, and two runs after it were completely green at 118 suites
   and 1294 tests. The old order-dependent suspects in `.todo/local/misc-carryover.md` date
   from before the suites moved off the development database on 2026-09-15, and none of them
   reproduced. Cross-suite interference in `app_test` is still possible and still worth the
   targeted rerun, but it is no longer the first explanation to reach for.
4. **Whether the run finished at all.** Exit 139 is SIGSEGV. One run in eight stopped at 93 of
   116 suites with no failures, no `Test Suites:` line, and no `--outputFile` JSON, faulting
   inside V8's garbage collector rather than in any test. Read the exit code and the summary
   line before reading a run as a result.
5. Whether the API is up, for `tests/routes/`. Bare `AggregateError` is a refused connection.
   `bin/devserver.sh status` shows nodemon alive after the app crashed; read `logs/api.log`.
6. **Whether the duration is round.** 5 s or a multiple of 10 s is a timeout, usually an
   external service not answering. Rerun with `--testTimeout=60000` before hunting a bug.

## Concurrency suites

- **Every `*.concurrency.test.js` file calls `jest.setTimeout(RACE_TIMEOUT_MS)`** from
  `tests/services/concurrency-utils.js`. A new file without it times out on a cold database.
- **A race is rejected two correct ways**: the `grant_no_overlap` violation (409) or a Postgres
  deadlock `40P01` with no HTTP status. Match with `RACE_REJECTION_PATTERN` and assert
  `expect([409, undefined]).toContain(status)`. Assert that exactly one transaction committed.

## Traps when writing a test

- **`__basedir` counts from the test file.** `tests/services/x.test.js` needs two `..`;
  `tests/services/datasets/x.test.js` needs three. The wrong value fails only once the suite
  imports auth, as `ENOENT: tests/keys/auth.key`.
- **`toBeDefined()` passes for `null`.** Use `not.toBeNull()` and `toBeNull()` for rows.
- **Call `sseManager.shutdown()` in `afterAll`** in any suite that creates a notification.
  `src/notification/inApp/sseManager.js` opens two Redis connections on load, and Jest never
  exits otherwise.
- **Do not pull `mjml` into a suite.** It needs `--experimental-vm-modules` and fails as
  "Test suite failed to run" after every test passed. Compile the `.hbs` with `handlebars`.
- **`jest.spyOn` misses a call a module makes to itself.** Inject the collaborator, or spy on
  the boundary the module crosses.
- **Grants accumulate across tests.** Through the access-type order, an earlier `DOWNLOAD`
  grant covers a later `LIST_FILES` request and the approval writes nothing. Add an
  `afterEach` that deletes grants for the resource.
- **Pick incomparable access types** when independence matters:
  `DATASET:VIEW_SENSITIVE_METADATA`, `DATASET:DOWNLOAD`, `DATASET:LIST_DERIVED_DATASETS`.
  `findMany({ take: 3 })` returns types that imply each other.
- **Do not count rows the order can absorb.** Expand held grants and check each type is held.
- **Seeded ids resolve.** `00000000-...-000000000000` is Authenticated Users, and the
  `ffffffff-...` ids in `src/constants.js` are seeded groups. Use `randomUUID()` for a 404.
- **`createTestGroup(actorId)` does not make the actor an admin.** Add a `group_user` row.
- **Membership lookups** use `activeMembership` or `membershipHistory` from
  `tests/services/helpers.js`. There is no `group_id_user_id` key.
- **Archive with `groupsService.archiveGroup`**, never by writing `is_archived`. The service
  also checks state, sets `archived_at`, and writes the audit row.
- **Do not call v1 `datasetService.create` for a fixture row.** It throws in project
  association. Use `buildDatasetCreateQuery` plus `prisma.dataset.create`, with
  `owner_group_id` and `resource_id`.
- **`$queryRaw` with `SELECT *` on `grant` throws** on the `tsrange` column. Name columns.
- **To test a guard, seed the forbidden state** with `prisma.<model>.create`, and name the real
  sequence that reaches it in a comment.
- **When a layer becomes a no-op, grep its tests for `toBeGreaterThan(0)`.** Each forcing
  check either moved or must now assert zero with a comment.
- **Pin a reversal with a test** asserting the new freedom; do not only delete the old suite.
- **`uiScan` allowlist entries that match nothing fail the scan.** Delete them with their line.
- **A fixture that builds a hierarchy must write `group.parent_id`, not only the closure.**
  The column is authoritative and the closure is derived from it, and
  `groups.sibling-name-uniqueness.test.js` asserts over the whole table that the two agree. A
  world that writes closure rows alone leaves its groups in the root name space and fails that
  suite from another worker.
- **`group.parent_id` is ON DELETE RESTRICT, and the check is immediate.** A parent cannot go
  in the same statement as its children, however the ids are ordered. `deleteGroup` in
  `tests/services/helpers.js` collects the subtree and deletes deepest first; a suite doing its
  own cleanup deletes in reverse creation order.
- **Operation sequences:** keep `size: 'max'` on `fc.commands`. Replay with
  `MODEL_SEQUENCE_SEED`. A group's parent is `group.parent_id`, mirrored by the
  `group_closure` row at depth 1.

## Keeping this current

When a session hits a failure this page does not explain — a new stale pattern, a suite that
turns out to be order-dependent, a helper that was missing — amend this file in the same
change, and put the explanation in `docs/contributing/techniques/api-tests.md`. Record dead
ends explicitly, and confirm a claim by running the suite before writing it down here.

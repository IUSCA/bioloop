---
title: End-to-end test plan
order: 12
status: active
implemented: none
last_verified: 2026-09-09
---

::: warning Design record — active
The ordered work to build a browser-driven test suite for the v2 groups system. The flows it
must prove are in [End-to-end test flows](./e2e-test-flows.md), which was written from the
design records before any of this code was read. This page is the grounded half: what exists,
what does not, what each flow costs, and the order to build in.

Every measurement below was taken on 2026-09-09 against the repository and the running
development database. Re-verify before relying on a number.
:::

<!-- cspell:ignore Priya ajohnson sdavis ethompson -->

# End-to-end test plan

## What this page adds to the flows page

[End-to-end test flows](./e2e-test-flows.md) says what must be proved. It names no file on
purpose. This page maps each flow onto a page, a route, and a selector, and then says what
has to be built before any of it can run.

The short version is that four things are missing, and only one of them is test code.

1. The v2 UI carries no test hooks at all.
2. The seed's *sample* world cannot supply a named cast, so the suite builds its own world.
   (The seed now also writes a named cast for manual use — see F2.)
3. The existing Playwright suite is organised around v1 roles, which v2 does not have.
4. Nothing runs Playwright in CI.

## What exists today

### The v1 suite, measured

`tests/` holds a working Playwright suite. Its shape matters because the natural instinct is
to add v2 specs to it, and that instinct is wrong for reasons given below.

| Property | Value |
|---|---|
| Playwright | 1.43.0, pinned in `tests/package.json` and again in `tests/Dockerfile` |
| Module system | CommonJS |
| Test root | `tests/src/tests`, per `tests/playwright.config.js` |
| Projects | 18, hand-written, one per role per feature |
| Authentication | Mocked CAS ticket at `/auth/iucas?ticket=<role>`, requiring the API at `NODE_ENV=ci` |
| Sessions | Three `storageState` files under `tests/.auth/`, gitignored |
| Roles | `admin`, `operator`, `user` — the v1 RBAC roles |
| Coverage | Sidebar, notifications, user management, projects, import, upload |
| Runner | The `e2e` service in `docker-compose-e2e.yml`, profile `e2e-runner` |
| CI | None. `.github/workflows/` holds `deploy.yml` and `workers-poetry.yml` only |

It is a competent suite for what it covers. `tests/src/actions/`, `tests/src/api/`, and
`tests/src/fixtures/` are a real page-object and API-helper layer, and the role-gated feature
pattern documented in [Role-gated features](../../guides/testing/role_gated_features.md) is a
sound answer to the question it was asked.

### Why v2 does not belong in it

Four reasons, in order of weight.

**Its unit of identity is a role, and v2's is a group standing.** Every project in
`playwright.config.js` selects one of three RBAC roles. The v2 model has no roles below
platform admin: what a person may do follows from which groups they belong to, which they
administer, and which grants reach them. The flows in
[End-to-end test flows](./e2e-test-flows.md) need at least eight distinct actors, and several
need two actors inside one test. A project per actor per feature is a combinatorial list
nobody will maintain.

**Its authentication needs `NODE_ENV=ci` on the API.** The mocked-ticket path in
`api/src/routes/auth/iucas.js` runs only under that mode. A developer running
`bin/devserver.sh up` is not in that mode, so the existing suite cannot be pointed at an
ordinary dev stack. A v2 suite that cannot be run against the stack a developer already has
open will not be run.

**Its role-gated pattern carries a three-way config sync.** The runtime feature config, the
test config, and the project list all have to move together whenever a role's access changes.
That tax is per feature, and v2 has more surfaces than v1.

**Its `testMatch` globs are absolute and hand-listed.** Adding a v2 area means editing the
project list rather than adding a file. Twenty-plus flows means twenty-plus edits.

None of this is a criticism of the v1 suite. It is a statement that the two suites answer
different questions and should not share a configuration file.

## Five facts that shape the plan

### F1 — The v2 UI has no test hooks

Measured: **zero** occurrences of `data-testid` across the 138 `.vue` files under
`ui/src/components/v2` and `ui/src/pages/v2`. The v1 tree has roughly fifty, concentrated in
the import stepper, the upload table, and user management, which is exactly where the v1
suite tests.

This is the largest single cost in the plan, and it is not test code. Every flow that clicks
a v2 control needs a hook, and adding hooks means editing production components.

Two consequences.

**The hook work is its own phase, ahead of the specs.** Writing specs against class names or
text content produces a suite that breaks on every design-system pass, which the
[v2 design system](../../contributing/v2-design-system.md) work makes frequent.

**Adding hooks is a v2 change to v2 files, so it does not touch the cut-over rule.** Every
component listed in this plan lives under `ui/src/components/v2` or `ui/src/pages/v2`. No
legacy file is edited, and the shared `components/filebrowser/` tree is reached through the
props pattern the [v2 cut-over](../v2-cutover.md) already describes.

### F2 — The sample world's cast is a hash; a named cast is seeded beside it

`generateGroupUserMemberships` in `api/prisma/seed_data/groups.js` picks members with
`simpleHash(group.id + userId) % 100 < 10`, then names one or two of them admin. The result
is deterministic given the same user list, and it is opaque: nothing in the seed says who
administers what.

**Since 2026-09-11 the seed also writes the flows page's named world**, in
`api/prisma/seed_data/flows_world.js`: the accounts `priya`, `dana`, `alice`, `bob`, `carol`,
`erin`, `frank`, and `quinn`, the Midwest Genomics Center hierarchy, its four datasets, and
`Aim 2 Release`. It exists so the flows can be walked by hand in a browser. **The suite still
builds its own world and does not read these rows**, for the reason below: a spec that
hard-codes a seeded identity fails whenever somebody edits the seed. The two worlds do not
collide — the suite's rows are named `e2e-<runId>-*`, and the flows cast does not match the
`user-%` pattern the borrow query uses, so none of it is borrowable.

The paragraph that follows measures the sample world, and is unchanged by that addition.

Measured against the running database today:

| Group | Admin | Live datasets |
|---|---|---|
| Center for Genomics and Bioinformatics | `user-009` | 1 |
| Dr. Alice Wong Lab | `user-084` | 2 |
| Dr. Brian Kim Lab | `user-047` | 3 |
| Dr. Carla Patel Lab | `user-002` | 3 |
| Genomics Core | `user-095`, `user-046` | 5 |
| Bioinformatics Core | `user-059`, `user-049` | 2 |
| Imaging Core | `user-088`, `user-025` | 2 |
| NeuroSeq Atlas | `user-054` | 3 |
| Cancer Pathways AI | `user-080` | 2 |
| Unified Immune Signature | `user-057` | 3 |

Thirty-seven `user-0NN` accounts belong to no group, hold only the `user` role, and are
therefore borrowable; `user-004`, `user-005`, `user-010`, `user-013`, and `user-014` are the
first five. Re-measured 2026-09-11 with the borrow query itself, against a database carrying
both the sample world and the flows world. `BORROWED_ACCOUNT_COUNT` is 6, so the margin is
31. An earlier version of this line read as though only five existed, which would have put
the suite one account below its own minimum.

Those names are stable only while the generated user list and the hard-coded group ids are
both unchanged. Adding one user to `createRandomUsers` reshuffles every membership. **A spec
that hard-codes `user-084` is a spec that fails the next time somebody edits the seed for an
unrelated reason.**

**Three accounts are stable, and they are the ones the zero-access flows need.** The
[dev-servers skill](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/dev-servers/SKILL.md)
names `ajohnson`, `sdavis`, and `ethompson` as seeded users who hold the `user` role and
belong to no group, and tells a session not to hand-insert an account for this case because
the seed already covers it and a hand-made row disappears at the next reset. Verified on
2026-09-09: all three exist, hold `user`, and have zero open memberships. `test_user` holds
`admin` and also has zero memberships, which is why signing in as it proves nothing.

That guidance changes the world-building decision below, and the change is worth stating
plainly: the suite creates groups and resources, and it borrows people.

The hierarchy itself is hard-coded and stable, and it is close enough to the flows page's
cast to reuse. Center is the parent of three cores and three labs; each lab is the parent of
one project group. `NeuroSeq Atlas → Dr. Alice Wong Lab → Center` is the depth-2 chain the
transitivity flows need, with the project group standing in for the sub-lab.

### F3 — The credential-free login route is the right primitive, and its guard now works

`POST /auth/test_login` signs in as any active user by username with no credential at all.
`ui/src/pages/dev-login.vue` wraps it, so `https://localhost/dev-login?username=user-084&next=/v2/groups`
gets past both the certificate interstitial and the login in one navigation. This is the
right primitive for a v2 suite: one call per persona, no browser needed for setup, no CAS
mock, and no `NODE_ENV=ci` requirement.

**Its guard did not work when this plan was written, and was fixed before any of it was
built.** The route, the Swagger UI mount, and the production request-logging switch were all
gated on `config.get('env')`. That key was the literal string `default` in
`api/config/default.json` and was overridden in no other config file, because the setting
that actually tracks the environment is `mode`. So all three guards stood open in every
deployment, including production.

The fix removed `env` from the config entirely and put one predicate behind all three:
`isDevelopment()` in `api/src/utils/environment.js`, an allowlist over `mode` covering
`localhost`, `docker`, and `ci`. It is an allowlist rather than a check for "not production"
so that a misspelled `NODE_ENV` such as `prod` closes the surfaces instead of opening them,
and an unset `NODE_ENV` throws at startup rather than guessing. The three documents that
repeated the false claim — the route comment, the dev-servers skill, and the dev-servers
guide — were corrected in the same change.

**What this means for the plan.** The suite may rely on `/auth/test_login` in `localhost`,
`docker`, and `ci`, and must not assume it exists anywhere else. A CI job that forgets to set
`NODE_ENV` will fail at API startup, which is the intended behaviour and is worth
recognising when it happens.

### F4 — The seed already grants to the system principals

`generateGroupAccessSeedData` in `api/prisma/seed_data/groups_access_data.js` deliberately
writes "a global grant to each of the two system principals". That is right for a development
environment, which should demonstrate both principals, and it is wrong for flow H1, which
asserts that a person with no groups and no grants sees nothing.

The suite therefore cannot assert absolute emptiness against seeded data. It has to assert
emptiness of a purpose-built resource, which is one more reason for F5's own world.

### F5 — Nothing runs Playwright in CI

`.github/workflows/` holds a deploy workflow and a Poetry workflow. The v1 suite runs only
when somebody invokes the `e2e` compose profile by hand. A suite nobody runs decays within a
month, so wiring the new suite into CI is part of the plan rather than a follow-up.

## The shape of the new suite

### Where it lives

A new top-level directory, `e2e/`, beside `tests/`. Not `tests/v2/`, because the two suites
need different Playwright configurations, different authentication, and different module
systems, and one `playwright.config.js` cannot hold both without the project list growing
past readability.

```
e2e/
├── package.json                  # its own Playwright, pinned
├── playwright.config.js
├── README.md                     # how to run it, and against what
├── .auth/                        # gitignored storage states
├── src/
│   ├── world/
│   │   ├── build.js              # creates the fixture world through the API
│   │   ├── teardown.js           # removes it, grants before resources
│   │   └── cast.js               # the persona names and what they stand for
│   ├── fixtures/
│   │   ├── personas.js           # a Playwright fixture per persona
│   │   └── api.js                # an authenticated APIRequestContext per persona
│   ├── pages/                    # one page object per v2 page
│   ├── assertions/
│   │   ├── parity.js             # hidden control implies server refusal
│   │   ├── explanation.js        # every allow names its source
│   │   └── notifications.js      # in-app rows, and MailHog messages
│   └── specs/
│       ├── boundary/             # the refusal spine
│       ├── grants/
│       ├── requests/
│       ├── membership/
│       ├── invitations/
│       └── restrictions/
└── config/
```

Specs are named for the flow they implement, so `boundary/H1-zero-access.spec.js` is
searchable from the flows page and back.

### Language and version

JavaScript, CommonJS, matching `api/` and `tests/`. Playwright pinned to one version in
`e2e/package.json`, and the same version pinned in whatever container runs it, because the v1
suite already documents that a mismatch makes the suite invisible to the runner.

TypeScript would give the page objects real types and is the better long-run choice. It is
not proposed here, because no other package in this repository is TypeScript and a
single-package exception is a maintenance cost paid by whoever inherits it. Revisit if the
page-object layer grows past about a thousand lines.

### Authentication: one storage state per persona, minted through the API

> Phase 1 built something else. The fixture navigates to `/dev-login` and lets the application
> sign itself in, for the reasons given under [Phase 1](#phase-1-the-harness). This section
> stays because minting is the answer if a run ever gets slow enough to need it, and because
> the two traps below apply either way.

The v1 suite drives a browser through a mocked CAS ticket. The new suite calls
`POST /auth/test_login` directly from a Playwright `APIRequestContext`, reads the token out of
the response, and writes a `storageState` file with `token` and `user` in `localStorage` —
the two keys `ui/src/router/index.js` and `ui/src/stores/auth.js` actually read.

This is faster, needs no browser for setup, and works against `bin/devserver.sh up` as well
as against the compose stack. One global setup file mints every persona in one pass.

Two traps, both already documented elsewhere in the repository.

**A stale storage state fails as a foreign key, not as a 401.** `prisma migrate reset`
re-seeds with new `subject_id` values, `authenticate` trusts the payload it verified, and the
write then dies on a constraint. The
[v2-ui-changes skill](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/v2-ui-changes/SKILL.md)
records this. The global setup must therefore mint fresh states on every run rather than
reusing a file, and must never be given a `reuseExistingServer`-style shortcut.

**Signing in as `test_user` proves nothing.** The engine short-circuits for a platform admin
before any policy runs, per
[decision 11](./decisions.md#_11-platform-admin-is-one-check-in-the-engine). Exactly one
persona in the suite is a platform admin, and it is used only for the flows that require one.
A defect survived an entire phase of the access-requests work because every browser check had
been driven as a platform admin.

### Personas, and how a spec asks for one

Playwright fixtures rather than projects. A spec declares the personas it needs, and the
fixture supplies a `page` already signed in as that person plus an `APIRequestContext`
carrying the same token.

```js
test('Frank cannot reach a Wong Lab dataset', async ({ frank }) => {
  await frank.page.goto(`/v2/datasets/${world.datasets.wongPrimary.id}`);
  await expect(frank.page.getByTestId('access-denied')).toBeVisible();
});
```

Two personas in one test is the common case — an admin acts, a member observes — so the
fixture must supply independent browser contexts rather than reusing one page. Flows F5, G1,
and B2 all need it.

The cast is assembled from accounts that already exist. Only the standing is built.

| Flow-page persona | Account | Standing |
|---|---|---|
| Priya | `test_user` | Platform admin, seeded |
| Dana | a `user-0NN` account | Made admin of the built center |
| Alice | a `user-0NN` account | Made admin of the built lab |
| Bob | a `user-0NN` account | Made member of the built lab |
| Carol | a `user-0NN` account | Made member of the built project group |
| Erin | a `user-0NN` account | Made admin of the built sibling lab |
| Frank | a `user-0NN` account | Made member of the built sibling lab |
| Quinn | `ajohnson` | Seeded, no group, `user` role — used as it is |
| Vic | none | An address only; the account appears during flow C1 |

Which `user-0NN` accounts fill the six middle rows does not matter, because the suite assigns
their standing rather than reading it. The builder takes the first six that hold no
membership in any group it created, so a spec never depends on a seeded membership.

## Build the world, borrow the people

### The decision

The suite creates its own groups, memberships, datasets, collections, and grants at the start
of a run, and removes them at the end. It **does not create user accounts**, and it does not
assert against seeded groups or seeded grants.

Three reasons for building the structure, each established above. The seed's memberships are
a hash and will move (F2). The seed grants to both system principals, so nothing is truly
invisible (F4). And a suite that mutates seeded rows leaves a developer's database different
from how it started, which turns "run the e2e suite" into a thing people avoid.

Two reasons for not creating accounts.

**The seed already covers both shapes, and the skill says not to duplicate them.** Ordinary
users with no group and users inside the sample groups both exist. A hand-made account
disappears at the next reset, so anything built on one has to be rebuilt anyway.

**Creating a user fires a hook that this suite tests.** `services/user.js` wraps account
creation in a transaction and runs the `USER_CREATED` handlers, one of which applies that
address's pending invitations, per [Invitations](./invitations.md). A world builder that
creates accounts is exercising the invitation path on every run, before the invitation flows
have started. Flow C1 is where an account should first appear, and it should appear because a
person accepted an invitation.

The cost of building the structure is real: it is slower than reading a seeded world, and it
needs a platform-admin session. It is worth paying because the alternative is a suite whose
failures cannot be distinguished from seed drift.

### How it is built

Through the HTTP API as Priya, not through Prisma. The API is the thing under test, and a
world built by direct inserts can be one the API would refuse — a dataset with no resource
row, a grant that violates the exclusion constraint, a group with no closure entry. Building
through the API means the fixture is itself a check that the creation paths work.

The order is fixed by the model: groups, then the closure, then memberships of borrowed
accounts, then datasets with their owning groups, then collections, then grants.

Every name carries a run identifier — `e2e-<runId>-wong-lab` — so a crashed run leaves rows
that are obviously orphaned and a later run cannot collide with them. This matters because
dataset names are unique within `[owner_group_id, name, type, is_deleted]` per
[Dataset storage](./dataset-storage.md), and a rerun after a crash would otherwise conflict.

### How it is torn down

**Through SQL, not through the API, because the API deliberately offers no way.** There is no
`DELETE /groups/:id`, and `DELETE /v2/datasets/:id` is commented out in
`routes/datasets_v2/index.js`. Groups expose deletes only for members, admins, and
invitations; collections do have `DELETE /collections/:id`.

That absence is the design working, not a gap. Archiving is not deletion, and history is
preserved rather than removed — [decision 1](./decisions.md#_1-membership-and-collection-history-are-preserved)
and the archiving section of [Design](./design.md#archiving-groups) both turn on it. **Adding
a destructive endpoint so a test suite can tidy up would put a hole in the model to serve the
tests**, and it would be a hole with no policy anyone had reason to write. The suite gets a
small Postgres client of its own instead, and deletes its own rows by run identifier.

So the world is **built through the API** — which makes the fixture a check that the creation
paths work — and **torn down through SQL**, which keeps the teardown out of the product.

**Grants before resources.** `grant.resource` is `ON DELETE RESTRICT`, which
[the access and requests plan](./access-requests-plan.md#testing) already records as a trap
for the API suites, and which is the same reason `api/src/scripts/delete_datasets.js` is
listed as broken in the [v2 cut-over](../v2-cutover.md#what-only-the-cut-over-may-do).

Teardown runs in Playwright's global teardown and is idempotent, keyed on the run identifier.
A run that crashes leaves rows behind, so `e2e/src/world/teardown.js` also takes a run id on
the command line for cleaning up by hand.

**Membership and collection rows are closed rather than deleted** by the services, per
[decision 1](./decisions.md#_1-membership-and-collection-history-are-preserved). Teardown
therefore has to delete the group, not merely empty it, and a spec that asserts on history
must not assume an empty table.

**Borrowed accounts are left exactly as they were found.** Deleting the built groups removes
the memberships the run created, and nothing else about those users is touched. A run must
never remove a seeded membership, because the next developer to sign in as `user-054` expects
to still be an admin of NeuroSeq Atlas.

For cleaning up by hand after a crash, the credentials are in `api/.env` and there is no
`psql` alias. `docker compose exec postgres psql -U postgres` does not work, because that role
does not exist:

```sh
cd api && set -a && . ./.env && set +a
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" \
  -U "$DATABASE_USER" -d "$DATABASE_DB" -c "select name from \"group\" where name like 'e2e-%'"
```

`psql -c` prints only the last statement's result when several are passed in one string, so
run one `-c` per query.

## Driving the running app

Two skills already record what this environment does when driven from a browser:
[dev-servers](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/dev-servers/SKILL.md)
for the stack, and
[v2-ui-changes](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/v2-ui-changes/SKILL.md)
for the components. Everything below is theirs; it is repeated here because a suite that
rediscovers it will spend the sessions they already spent.

### The stack has to be up, and `status` will lie about it

`bin/devserver.sh status` reads a pidfile holding the **nodemon** process. Nodemon outlives a
crash of the app it supervises, so `status` prints `api running pid 924` while every request
is refused. The listening-port column is the honest signal, and an `api` row with no port is a
crashed app.

The suite must therefore gate on a probe rather than on `status`. The API takes about twelve
seconds to boot, and until it does the UI log fills with `ECONNREFUSED` from the Vite proxy,
which is the normal startup window rather than a fault.

```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/       # expect 200
curl -s  -o /dev/null -w "%{http_code}\n" http://localhost:3030/   # expect 401
```

**A 401 from the API means it is alive and demanding authentication.** Treat it as success.
Global setup polls both until they answer, with a ceiling, and fails with the two status codes
in the message rather than with a Playwright timeout.

`logs/api.log` carries the verdict when the probe never passes. `Listening:
http://localhost:3030` is the last line of a good boot and `[nodemon] app crashed` of a bad
one.

### A database reset takes the API down with it

`prisma migrate reset` truncates the access-type table for a moment. The API validates those
at startup, exits with `Grant access types missing from database: …`, and nodemon gives up
rather than retrying. The seed puts the rows back, but nothing restarts the server.

Two rules follow. **Never reset inside a run.** And after any reset, restart the API and mint
fresh storage states, because a token from before the reset carries the old `subject_id`,
authenticates fine, and then dies inside a write on a foreign key such as
`grant_granted_by_fkey` — surfacing as a 409 about a constraint violation with nothing naming
the session.

### What is drivable, and the one thing that is not

The v2-ui-changes skill established this against the running app, using synthetic events. Its
findings transfer to Playwright with one caveat given below.

| Element | Behaviour |
|---|---|
| Buttons the app renders, including typeahead suggestions | Respond to a plain click |
| Plain `<input>` | Takes a normal fill |
| Plain `<div>` carrying `@click`, such as the access-type rows | Responds to a plain click |
| `va-select` | Ignores synthetic clicks and keys — but **takes real Playwright input normally** |

`va-select` was the open question, because it appears in the owning-group picker, the
dataset-type picker, the subject selector, and the expiry selector — most of the forms this
suite has to fill.

**Spike 1 settled it: Playwright drives it.** The skill's finding is about events dispatched
from `evaluate_script`; Playwright sends real input over the Chrome DevTools Protocol, which
the component cannot distinguish from a person. A click on the select followed by a click on
`getByRole('option', { name: … })` changes the bound value. Measured on two selects in
different components, both green first time. **The `setupState` escape hatch the skill
describes is for the MCP browser, and this suite does not need it.**

One trap surfaced while measuring it, and it will recur. A locator written as `.va-select`
filtered on the value it *currently* shows stops matching the instant the value changes, and
Playwright reports "element(s) not found". That reads exactly like the click having failed.
Hold a select by its position within the modal, and assert on its text.

### Assert with retrying expectations, never with a read after an action

A click updates a ref and Vue re-renders on the next tick, so a script that clicks and then
reads `checked`, `aria-disabled`, or `innerText` in the same call sees the values from before
the render. That looks exactly like the click having done nothing, and it cost a session.

Playwright's `expect(locator)` retries until it passes or times out, which is the correct
answer. **A spec must not read state with `page.evaluate` after an action.** Where a
measurement genuinely is the assertion — a computed style, a row count derived from several
attributes — it goes inside `expect.poll` so it retries too.

**A row that toggles must be clicked once.** Clicking the same access-type row twice leaves it
off, and the stale state that remains is not a component defect. Local runs use `retries: 0`
so a half-completed test is diagnosed rather than papered over; CI keeps retries, and every
retry starts from a fresh world.

### Notifications need Redis, and email needs one more process

In-app notifications need Redis and the API and nothing else. The row is written by
`InAppNotificationService.create`, published to a per-user Redis channel, and read back by
the API process holding the browser's SSE connection.

Email additionally needs `api/src/notification/worker.js` and MailHog.
`[Worker] Ready — waiting for jobs` in `logs/notifications-worker.log` is the last line of a
good boot, and `SMTP connection verified` above it means MailHog is reachable.

**Do not start the worker twice.** `npm run dev:all` in `api/` runs the API and the worker
together, and it is an alternative to `bin/devserver.sh up` rather than an addition — running
both gives two workers competing for the same queues, which makes an email assertion flaky
for a reason no spec will reveal.

## Selectors

### The convention

`data-testid`, kebab-case, prefixed by the surface. `group-members-tab`,
`grant-issue-submit`, `access-request-review-approve`. The v1 suite already uses
`data-testid` and `getByTestId`, so the convention carries over even though the suites do not.

Three rules keep the hooks from rotting.

- **A hook names what the element is for, never what it looks like.** `grant-revoke-confirm`,
  not `red-button`.
- **A list row carries the id of what it holds.** `dataset-row-<id>`, so a spec asserts on the
  row it built rather than on position.
- **A hook is added in the same change as the spec that needs it,** and never speculatively. A
  hook nothing reads is a hook nobody will keep correct.

### The hazard specific to this suite

Most flows in [End-to-end test flows](./e2e-test-flows.md) assert that something is *absent*.
A `toBeVisible()` on a selector that matches nothing passes for the wrong reason, and so does
`not.toBeVisible()` on a selector whose name was misspelled.

**Every absence assertion is paired with a presence assertion on the same page.** Flow A3
asserts that Alice has no add-member control *and* that she can still read the member list.
The pair is what distinguishes "the control is correctly hidden" from "the page failed to
load".

The `assertions/parity.js` helper carries the other half. For each hidden control, it calls
the route behind it with the same persona's token and asserts a refusal. This is flow N3, and
it is the assertion that makes the rest of the boundary suite worth anything: hiding a button
is a courtesy, and the refusal is the security property.

### Adding the hooks is a codemod, and a codemod here has bitten twice

Roughly a hundred attributes across several dozen components is not a hand edit. The
[v2-ui-changes skill](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/v2-ui-changes/SKILL.md)
records two ways a scripted edit across `.vue` files has already gone wrong, and both apply
directly.

**Scope every replacement to the opening tag it belongs to.** A bare string replacement across
a file also rewrites the component three elements away. Match the tag first, then rewrite only
its attributes.

**Anchor the script so a silent no-op is impossible.** Every replacement asserts its anchor is
present and exits otherwise. A script reporting success while having matched nothing is worse
than one that crashes.

**Then diff before believing it.** `git diff -U0 -- ui/src | grep -E "^[-+]" | grep -v "^[-+][-+]"`
and read every line that is not the change you meant. Both collateral edits the skill records
passed `eslint` and `npm run build` cleanly, so the toolchain will not catch this class of
mistake.

The verify loop after any hook pass, formatting only the files that changed:

```
npx prettier --write <the files you touched>
npx eslint "src/**/*.vue"
npm run build
```

`npm run build` is the real template check. `npx vue-tsc --noEmit` does not start in this
repository and is not worth chasing.

Four shell traps the skill records, all of which a hook script will meet:

- `cp` and `rm` prompt. Use `/bin/cp -f`, `/bin/rm -f`, or `git rm` — a prompting command
  inside an automated step hangs until it times out.
- zsh expands `--include=*.vue` unless it is quoted.
- A newline-joined file list overflows the argument and reports "File name too long". Use
  `find … -print0` piped to `xargs -0`.
- The working directory persists between steps, so prefer absolute paths.

### The `va-select` question

Covered under [Driving the running app](#what-is-drivable-and-the-one-thing-that-is-not). It
is spike 1 of phase 0, it is the single question most likely to change the shape of the
page-object layer, and an escape hatch exists whichever way it resolves.

## Assertions that need their own helper

### Explainability

Flows I1, I2, and I3 assert that every allow and every deny is explained in one sentence.
Asserting on exact copy makes the suite break on wording changes, and asserting on nothing
makes the flow vacuous.

The helper reads the explanation region by testid and asserts that it names the expected
*source* — the group, the collection, or the preset — by the identifier the world builder
created. A sentence naming `e2e-<runId>-wong-lab` is checkable without pinning the sentence.

### Notifications

Flow G1 requires that a submission reaches the reviewer and a decision reaches the requester.

**In-app** rows arrive over SSE, written by `InAppNotificationService.create` and pushed
through a per-user Redis channel. Redis and the API are enough; the notification worker is
not needed. The assertion waits for the row in the UI rather than polling the API, because the
push path is part of what the flow claims.

**Email** needs the notification worker and MailHog, and is only required by the invitation
flows. MailHog exposes `GET /api/v2/messages` on port 8025, which is how the invitation token
is read back — the invitations work already verified the emailed token is byte-identical to
the stored row that way. A run without MailHog skips the invitation email assertions
explicitly rather than passing them silently.

### Access as of a moment

Several flows assert that access changed on the *next* request rather than eventually. The
helper reloads and re-reads rather than waiting on a timeout, because a timeout hides a
caching defect instead of finding one.

## Running it

**Locally, against the stack a developer already has.**

```bash
docker compose up -d postgres redis mailhog   # 5432, 6379, 1025; MailHog UI on 8025
bin/devserver.sh up                           # api, ui, notifications-worker
cd e2e && npx playwright test
```

The suite targets `https://localhost` with `ignoreHTTPSErrors: true`, as the v1 config already
does for the self-signed certificate. Global setup probes both servers before anything else
runs, per [Driving the running app](#the-stack-has-to-be-up-and-status-will-lie-about-it).

`bin/devserver.sh up` starts the notification worker along with the API and the UI, so the
invitation flows work with no extra step — but it touches no Docker, so Redis and MailHog have
to be up first or in-app notifications never arrive.

**In a container**, as a second service in `docker-compose-e2e.yml` beside the existing `e2e`
one, under its own profile, so the two suites can be run separately.

**In CI**, as a new workflow. It needs Postgres, Redis, the API, and the UI, which the compose
file already composes. The invitation flows additionally need MailHog and the notification
worker; run them as a separate project so a CI environment without mail can skip that project
rather than fail it.

## Phases

Each phase is shippable on its own and leaves the suite green. The order is chosen so the
highest-value flows land before the most expensive component work.

### Phase 0 — settle five questions

Nothing here produces a spec. Each item is a question that changes the plan's shape, and each
names what would settle it.

1. ~~**Can Playwright drive `va-select`?**~~ **Settled: yes.** A plain click on the select
   followed by a click on `getByRole('option', …)` changes the bound value. Measured on two
   selects in different components — the role select in `AddGroupMemberModal` and the
   dataset-type select in `UploadDatasetModal` — both green first time, in
   `e2e/src/specs/spike/va-select.spec.js`. The skill's finding is about events dispatched
   from `evaluate_script` and does not transfer to real CDP input. **Phases 3 and 4 are
   ordinary form-filling, and the `setupState` escape hatch is not needed.**
2. ~~**Does `POST /auth/test_login` survive the F3 fix?**~~ **Settled.** The route is
   registered under `localhost`, `docker`, and `ci`, and absent under `production`, `test`,
   and any unrecognised mode. Verified by enumerating the auth router's stack once per mode,
   and by calling the route and `/doc` against a running dev server. The e2e compose stack
   runs `NODE_ENV=ci`, so it keeps the route.
3. ~~**How long does building the world take?**~~ **Settled: 288ms to build, 64ms to tear
   down.** Two orders of magnitude under the thirty-second threshold, so each worker builds
   its own world and no spec has to tolerate a shared one.
4. **Can a spec see an SSE notification reliably, and does the run then exit?** Drive one
   in-app notification end to end. Two precedents say the exit is the risk rather than the
   delivery: the SSE manager opened two Redis connections and never closed them until
   `shutdown()` was added for the API suites, and `npm run notify:dummy` still hangs after a
   successful send for the same reason.
5. ~~**What does the dataset page render for a caller with no access?**~~ **Settled: an
   error state inside the application shell.** Never a redirect, never an empty page. The
   dataset page renders "Failed to load dataset" with a "Try again" button; the group page
   renders "Failed to load group" and, less well, the raw axios string *"Request failed with
   status code 403"* beside it. A list page still renders its table and simply omits the
   rows. An anonymous caller on an unpublished public profile gets "This profile is not
   available … If you have a Bioloop account, sign in".

   **The trap this uncovered is worth more than the answer.** A malformed URL renders the
   *identical* refusal. The canonical dataset URL carries the resource UUID —
   `ui/src/pages/v2/datasets/index.vue` links to `/v2/datasets/${row.rowData.resource_id}`
   and the route validates `param('id').isUUID()` — so a spec driving the integer
   `dataset.id` sees "Failed to load dataset" for every caster and concludes the page refuses
   everybody. Every refusal assertion therefore needs its paired positive half, which is what
   `expectAbsentButPresent` exists to force.

Done when each question has a written answer in this page's own record.

### Phase 1 — the harness

`e2e/` exists, one persona signs in, one spec passes. The world builder creates the full cast
and hierarchy and tears it down cleanly. `assertions/parity.js` exists and is used by the one
spec.

Done when `npx playwright test` builds a world, signs in as three personas, asserts one true
thing, and leaves the database as it found it.

**Built.** Five specs in `e2e/src/specs/harness.spec.js` pass, six consecutive two-worker runs
are clean, and a census of eleven tables shows no drift across a full run. Three things differ
from what this page proposed, and each is a change made while building.

**Sign-in is a navigation, not a minted `storageState`.** The section above proposes writing
`token` and `user` into `localStorage` from an `APIRequestContext`. The fixture instead
navigates to `/dev-login`, which runs the application's own `onLogin`. The suite then never
has to know which keys the auth store persists or how it shapes them, and the stale-state trap
that section warns about cannot arise, because no state is reused. It costs about a second per
persona. Minting is still the right answer if a run ever gets slow enough to care, and it
belongs in one place rather than reproduced across specs.

**Builds are serialised by a Postgres advisory lock.** A worker chooses its accounts by asking
which seeded users belong to no group. Two workers building at once both read that list before
either writes to it, so both borrow the same six people: Alice in one world is also Alice in
the other, administering two labs, and every later assertion about what she can reach has two
explanations. Measured rather than predicted — two builds started together returned identical
casts, and three under the lock return disjoint ones. Serialising is affordable precisely
because of spike 3: a build costs a third of a second.

**A `globalSetup` warms both servers before any test runs.** A run against cold servers failed
two browser-driven tests while both servers were healthy. The first navigation waits for Vite
to compile a route, which can take tens of seconds, and the development API restarts whenever
anybody saves a file under `api/`, refusing connections for a second or two each time. The
warm-up compiles the first route once and retries the API heartbeat for a minute, so a restart
window is absorbed and the cost is a visible one-time wait rather than a timeout inside an
unrelated assertion. A server that is genuinely down still fails, naming which one.

Two defects in the fixture cast were found by the specs and are worth recording, because both
would have made later phases assert the opposite of what they intended. The borrowable pool
was ordered by username and `ajohnson` sorted first, so the zero-access user's account was
lent to the centre admin and every refusal that user exists to demonstrate read as an allow.
The pool now excludes the fixed accounts by name and is restricted to the seed's own
`user-0NN` rows. The world spec asserts that no two people share an account, which names that
cause directly; the spec that first caught it reported a wrong persona, which is the symptom.

### Phase 2 — the refusal spine

The boundary flows, which are the reason the suite exists and which need the least new UI
work, because asserting that a control is absent needs a hook only on the page's *positive*
half.

Flows: H1, H3, H4, G3, G7, J1, J2, L2, N1, N2, E2, F10.

Component work: hooks on the dataset page, the group page, the collection page, and the list
pages — enough to prove each page loaded, plus the refusal region from spike 5.

Done when a persona with no standing is proved unable to reach anything by page, by
identifier, or by the route behind the page.

**Built.** Fourteen specs across `e2e/src/specs/refusal/`, covering N1, H1, H3, H4, G3, G7,
J1, J2, L2, E2 and F10. Component work came to six `data-testid` hooks, not the forty-odd the
codemod section anticipated: one on `components/utils/ErrorState.vue`, which all 35 v2
surfaces render their refusal through, and one on the success branch of each of the five
pages the flows name.

**N1 is asserted by recording, not by an inventory.** `assertions/replay.js` drives the
dataset page as a permitted member with the network recorded, then reissues every call it
made as a stranger. N1 names "any programmatic route the browser itself calls", which is a
list nobody can keep accurate by hand; recorded from the running page it stays correct by
construction, and a call a component starts making tomorrow is tested with no edit here.

Three ways a refusal spec passes while asserting nothing were each found by a spec doing it,
and each is now guarded rather than remembered:

**A 404 that is not a refusal.** `GET /v2/datasets/:id/files` answered 404 to a *platform
admin*, because `listFiles` used `findFirstOrThrow` and a fixture dataset holds no file rows.
Every caller was refused, so the spec passed while enforcing nothing. `expectForbidden`
therefore asserts 403 exactly, and every use of it is paired with `expectNotForbidden` on a
caller the engine allows.

That 404 is fixed. A dataset holding no files lists as empty, and only an unknown dataset is
a 404, so the two answers are distinguishable again. The strict assertion stays regardless:
it guards against the next route that refuses everybody for a reason of its own.

**A 400 that is not a refusal.** Four governance specs sent a malformed body —
`POST /grants` requires an `approved_expiry` on each item, `PATCH /groups/:id` requires
`version`, `POST /groups/:id/members` takes `{user_id}` objects — and express-validator
rejected them *before the policy ran*. `expectForbidden` now fails with a message naming that
specifically, because a 400 and a 403 are equally red and only one of them is enforcement.

**A refusal with nothing to compare it to.** Every file in this phase carries a caller who is
*allowed*, on the same route, in the same test. Without one, a route that was renamed, broken
or never mounted reads as a policy working perfectly.

Two defects fell out, both filed rather than fixed here: L2 T14 — `/v2/datasets/:id/files/tree`
passed a resource UUID into an integer column and returned 500 to every caller — and L2 T15,
the 404-on-empty above. Both are fixed now, each with unit tests confirmed failing without
the change. One gap turned out to be already closed: gating access-request creation on the
resource was written as a `test.fail()` for flow G3, passed on its first run, and is now an
ordinary assertion.

The backlog those item numbers name is `.todo/`, which is gitignored, so they are written
here as plain references rather than links.

**Still open in this phase.** N2, the file browser's own download enforcement, needs a dataset
with ingested files; the fixture world creates none. Until it does, the read plane is asserted
at the route and the download button is not exercised.

### Phase 3 — the request loop

Flows: G1, G2, G5, G6, G8, and the notification half of G1.

Component work: `RequestAccessModal`, `RequestAccessForm`, `ReviewRequestModal`,
`ReviewRequestForm`, `ReviewItemRow`, `AccessRequestCard`, and the request detail page. This
is the phase spike 1 decides the cost of.

Done when a researcher files, an admin reviews and sees what approval confers, and both sides
read the truth afterwards — including flow G5, where an approved request whose grants were
revoked says so.

**Built.** Five specs in `e2e/src/specs/requests/loop.spec.js` covering G1, G2, G5, G6 and G8.
Twenty-seven specs pass across the suite, and a full run still leaves eleven tables unchanged.

**G5 is the one that mattered, and its first version was wrong.** The assertion read
`expect(JSON.stringify(summary)).toMatch(/revoked/)` and went green *before* anything was
revoked, because `access_summary` contains `"revoked": 0`. The summary is
`{issued, live, revoked, expired, last_revoked_at, last_revocation_type, covered_elsewhere}`,
so the honest test reads `live` and `last_revoked_at` both before and after the revocation.
The API carries everything the flow needs; only the test was weak.

**The world gained a group, for a reason worth stating.** A grant on a dataset also makes its
*owning group* visible: one `DATASET:VIEW_METADATA` grant to the sibling lab on a lab-owned
dataset took Frank from 403 to 200 on the lab's own group page, and broke a refusal spec in
another file. The request flows need datasets an outsider can see, so those live in a new
`requestLab` and `lab` stays a group the sibling branch cannot see at all. A fixture grant is
never local to the dataset it names.

**Each request flow owns a dataset.** The API answers 409 for a second pending request naming
an access type already asked for, and for one covering access already held. Both are correct,
and both mean a shared dataset would let whichever spec ran first decide whether the next could
begin. `cast.js` carries one `lockedFor*` dataset per flow.

Two corrections to earlier phases fell out. `GET /grants?resource_id=…` is not a route — it is
a 404, and a 404 satisfies "not forbidden", so F10's positive control had been passing against
a route that does not exist since phase 2. The real route is
`GET /grants/resource/:resource_type/:resource_id`, it rejects a `limit`, and it returns
`{subject, grants}` groups rather than a flat list. With it, F10 now asserts the full shape:
Alice reads the grant list, Dana reads it as oversight, and Bob — a member of the owning lab —
is refused it.

One defect filed: [L2 T18](../../../.todo/local/L2-authorization-wiring.md) — reviewing a
request without `approved_expiry` answers 500 rather than 400, because the route validates the
decision and not the expiry while the handler dereferences it unconditionally. Rejections are
unaffected, which is why it hides.

The operational half of all of this now lives in
[the e2e-tests skill](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/e2e-tests/SKILL.md).

### Phase 4 — grants and the access-type order

Flows: F1, F2, F3, F4, F5, F8, F9, and D1, D2.

Component work: `IssueGrantModal`, `SubjectSelector`, `AccessTypeSelector`, `PresetSelector`,
`ExpirySelector`, `GrantRow`, `GrantProvenanceBox`, `RevokeGrantModal`.

F3 and F4 are the flows worth the phase. Both assert the consequences of
[decision 7](./decisions.md#_7-access-types-imply-one-another) at the surface, and the
[access type order plan](./access-type-order-plan.md) records that its phase 3 — the UI naming
the order — is where the model and the interface still disagree. A failing F4 is a true
report, not a broken test.

F6 and F7, the supersession pair, are `Next` and follow when the surfaces exist.

### Phase 5 — membership and invitations

Flows: B1, B2, B4, B5, C1, C2, C3, C4, C6.

Component work: `GroupMembersTab`, `AddGroupMemberModal`, `EditGroupMemberRoleModal`,
`GroupInvitationsTab`, and `ui/src/pages/invite.vue`.

C1 needs MailHog and the notification worker, so it is the one project that may be skipped in
a reduced environment. C3 is worth writing carefully: it asserts that Vic's address is *not*
shown to Frank, which is an absence assertion about a specific string rather than about an
element.

### Phase 6 — restrictions, oversight, and the landing page

Flows: A1, A2, A3, A4, A5, K1, K2, O1, and the deliberate-absence table.

A5 asserts the enforcement hole recorded in
[Use Cases](./use-cases.md#enforcement-holes): the unarchive endpoint is authorized with
`'group', 'archive'`, so a group admin can reactivate their own group. **The spec is expected
to fail until that one line is fixed.** Write it anyway, and mark it as the failing assertion
it is, rather than writing it to match current behaviour.

O1 waits on the dashboard, which [Dashboard plan](./dashboard-plan.md) records as rendering
nothing today.

## Flow to surface

Where each flow lands. A blank surface means the flow asserts an absence and has no page of
its own.

| Flow | Page | Route behind it |
|---|---|---|
| A1, A2 | `/v2/groups`, `/v2/groups/:id` | `POST /groups`, `/groups/hierarchy` |
| A3–A5 | `/v2/groups/:id` | `/groups/:id/archive`, `/groups/:id/unarchive` |
| B1–B5 | `/v2/groups/:id` Members tab | `/groups/:id/members`, `/admins/:userId` |
| C1–C6 | `/v2/groups/:id` Invitations tab, `/invite` | `/groups/:id/invitations`, `/auth/invite/check`, `/auth/invite/apply` |
| D1–D5 | `/v2/datasets`, `/v2/groups/:id` Datasets tab | `POST /v2/datasets`, `/v2/datasets/eligible-owner-groups` |
| E1–E3 | `/v2/collections/:id` | `/collections`, `/collections/:id/datasets` |
| F1–F9 | Dataset and collection Access tabs | `/grants`, `/grants/compute-effective-grants`, `/grants/:id/revoke` |
| G1–G10 | `/v2/access-requests`, `/v2/access-requests/:id` | `/access-requests`, `/access-requests/:id/review` |
| H1–H4 | every list page | `GET /v2/datasets`, `POST /groups/search`, `/collections` |
| I1–I3 | Access tabs, dataset page | `/grants/…/coverage` |
| J1, J2 | descendant group and dataset pages | the capability map on each response |
| K1, K2 | archived group and its resources | every mutating route on them |
| L1, L2 | `/v2/audit-logs`, per-resource Audit tabs | `GET /audit/records`; `GET /v2/datasets/:id/audit`, `GET /collections/:id/audit`, `GET /groups/:id/audit` |
| M1, M2 | Access tabs, subject picker | `/grants` with a principal subject |
| M3 | — | unbuilt; no public router exists |
| N1–N3 | every v2 page | every route behind them |
| O1 | `/v2/home` | the eleven calls in the dashboard plan |

## What this suite must not do

**It must not re-test the authorization engine.** `api/tests/authorization/` and
`api/tests/services/` already cover the closure, the access-type order, restriction
propagation, and supersession, against the real database, in milliseconds per case. This suite
asserts that those answers reach the screen intact, and nothing more.

**It must not assert timings.** A flow may notice that a page never loads. It must not assert
that one loads within a number.

**It must not assert on styling.** Borders in this codebase need `border` *and*
`border-solid`, because Vuestic's reset loads after Tailwind's preflight and zeroes both — a
defect found twice, and one that only a computed-style measurement reveals. That measurement
belongs in a browser pass following the
[v2-ui-changes skill](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/v2-ui-changes/SKILL.md),
not in a suite whose subject is authorization. A spec asserting a colour or a border width
will fail on the next design-system pass and teach everyone to ignore it.

**It must not mutate seeded rows.** Every write lands on a resource the run created. This is
what makes the suite safe to run against a developer's own database.

**It must not be driven as a platform admin.** Stated twice on purpose.

**It must not edit anything under `tests/`.** The v1 suite keeps working unchanged, as the
[v2 cut-over](../v2-cutover.md) requires of every legacy surface.

## Already broken, and where the skills are stale

The v2-ui-changes skill keeps a list of things not to chase. Each was re-checked on
2026-09-09, because a stale entry sends a session after a defect that no longer exists.

| Skill claim | Status today |
|---|---|
| `pages/v2/home.vue` renders nothing — its template reads `dashboard`, its `<script setup>` never defines it | **Stale.** Phases 1 to 4 of [the dashboard plan](./dashboard-plan.md) rebuilt the page on `stores/v2/uiPersona`, and the skill no longer carries the claim. Flow O1 is unblocked |
| `AccessRequestReviewModal.vue` renders the literal text "Review Modal Stub" | **Stale.** The file does not exist. Phase B4 of [the access and requests plan](./access-requests-plan.md#b4--the-review-flow-is-reachable) deleted the stub and wired `ReviewRequestModal.vue` in |
| The access-requests page 400s on reviewed requests | **Stale.** The route accepted only `created_at` and `updated_at` while the tab sorted by `reviewed_at`; the same phase's browser pass fixed it |

All three rows are stale, and the amendment is due to
[.claude/skills/v2-ui-changes/SKILL.md](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/v2-ui-changes/SKILL.md),
not a change this plan makes. They are recorded here so phase 3 does not begin by looking for
a stub that is gone.

The dev-servers skill and [docs/guides/dev-servers.md](../../guides/dev-servers.md) both
carried the F3 claim and were corrected with the fix itself.

## Open questions

**Where does the world builder get its platform admin?** Building through the API needs a
platform admin session, which needs `POST /auth/test_login` and a seeded platform admin. That
couples the suite to the seed in exactly one place. The alternative is a dedicated service
account created by a migration, which is more machinery than the coupling is worth today.

**Should the suite run against a disposable database?** A per-run database would make F4's
system-principal grants irrelevant and let H1 assert absolute emptiness. It also means a
migrate-and-seed per run, which is slow, and it removes the property that makes the suite
useful to a developer mid-change. The plan above chooses the developer's database and a
purpose-built world. Revisit if world-building proves slower than seeding.

**How much of the deliberate-absence table is worth automating?** Nine rows in
[Deliberately absent](./e2e-test-flows.md#p-deliberately-absent) assert that a feature is not
there. Each is cheap to write and each will need deleting when the feature arrives. A single
spec asserting all nine, with one assertion per row, is probably the right size.

## Keep this page current

Re-measure F1 and F2 before starting any phase, because both are counts that move. When a
phase lands, replace its entry with what was built and what the browser pass found, in the
style [the access and requests plan](./access-requests-plan.md) uses. When a spec fails
because the system is wrong rather than the spec, record that here beside the flow rather than
weakening the assertion.

**Operational findings belong in the skills, not here.** A new way the stack fails to come up
goes in
[dev-servers](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/dev-servers/SKILL.md);
a new way a v2 component resists being driven goes in
[v2-ui-changes](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/v2-ui-changes/SKILL.md).
This page carries the plan and cites them. Duplicating a trap in both places guarantees the
copies diverge, and the copy in the skill is the one the next session will read.

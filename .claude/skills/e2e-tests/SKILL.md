---
name: e2e-tests
description: Operational technique for the Playwright suite in e2e/ that covers the v2 groups and access-control flows - how a world is built and torn down, the API shapes that are not what they look like, and the several ways a refusal test passes while asserting nothing. Use when writing or running anything under e2e/, or when a boundary test behaves unexpectedly.
---

# The v2 end-to-end suite

`e2e/` is the browser-driven suite for the groups and access-control flows. It is separate
from `tests/`, which covers v1. The flow catalogue it implements is
[e2e-test-flows.md](../../../docs/design/groups/e2e-test-flows.md).

- Reasoning, worked examples, and the full API-shape table:
  [docs/contributing/techniques/e2e-tests.md](../../../docs/contributing/techniques/e2e-tests.md)
- Stack prerequisites, sign-in, and recovery after a database reset:
  [e2e/README.md](../../../e2e/README.md)

```bash
cd e2e && npx playwright test                      # everything
npx playwright test src/specs/refusal --workers=1  # one area, serially
```

## The world

**The suite builds its own world and never reads the seeded flows cast.** Each worker builds
groups and datasets through the API (`src/world/build.js`), names every row `e2e-<runId>-*`,
and borrows seeded `user-%` accounts that belong to no group. Priya is `test_user` and Quinn is
`ajohnson` (`FIXED_ACCOUNTS` in `src/world/cast.js`). A spec that hard-codes a seeded identity
breaks whenever the seed changes.

Teardown is SQL (`src/world/teardown.js`), because there is deliberately no `DELETE /groups/:id`.
Never add a destructive endpoint for the suite. A new resource type needs a line in
`teardown.js`.

**A probe script that throws leaves its world behind**, and the row census will not notice.
Find orphans and clear them by run id:

```bash
cd e2e
node -e "const {query}=require('./src/world/db'); query(\"SELECT name FROM \\\"group\\\" WHERE name LIKE 'e2e-%'\").then(r=>r.forEach(x=>console.log(x.name)))"
node src/world/teardown.js <runId>
```

For raw psql, the credentials are in `api/.env`. `docker compose exec postgres psql -U postgres`
fails because that role does not exist:

```bash
cd api && set -a && . ./.env && set +a
PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" \
  -U "$DATABASE_USER" -d "$DATABASE_DB" -c "select name from \"group\" where name like 'e2e-%'"
```

Row-count drift after a run is not always a teardown bug. The database is shared, so check
whether the drifting rows carry the `e2e-` prefix.

`ASSIGNED_CAST` is also the borrow list, so a person appears in it exactly once. Extra
memberships go in `EXTRA_STANDING`.

## Ways a test passes while asserting nothing

Each of these shipped green before being caught. Helpers are in `src/assertions/parity.js`.

- **A 404 that is not a refusal.** `expectRefused` accepts 401, 403, and 404, so a route that
  was never mounted satisfies it. Use `expectForbidden` (403 exactly) when the claim is that a
  policy refused.
- **A 400 that is not a refusal.** `express-validator` runs before authorization. A malformed
  body is refused without the policy running. `expectForbidden` fails with a message naming
  this case.
- **A refusal with nothing to compare it to.** Every refusal needs an allowed caller on the same
  route in the same test: `expectAllowed`, or `expectNotForbidden` when the handler may answer
  non-2xx. `expectAbsentButPresent` is the same rule for pages.
- **An assertion that could not have failed.** Filtering grants by `DOWNLOAD` and expecting one
  passes even if three rows were written. Before trusting a green assertion, ask what data would
  have made it red.
- **A substring of the JSON.** `JSON.stringify(summary)` matches `/revoked/` because it contains
  `"revoked": 0`. Read the field.
- **A 400 that does not name the field.** Any validator satisfies it. `api.raw()` returns
  `{status, body}`, so assert both.

**Pick the status by what refused:**

- No standing on the resource the URL names: 404, `expectConcealed`. Pair it with a caller who
  reaches the same URL.
- Standing, but the action is refused, or the call names no resource: 403, `expectForbidden`.
- The resource's state refused, such as an archived group: 409, `expectConflict`. A platform
  admin gets the same 409. Pair it with `expectAllowed` on something whose state admits it.

Archiving covers the group and what it owns, one step. A sub-group keeps its own state and
accepts mutations.

## Assert with retrying expectations

- **Never read state after an action in the same step.** Vue re-renders on the next tick, so a
  read sees the old value and the click looks broken. Use `expect(locator)`, which retries. A
  measurement that is itself the assertion goes inside `expect.poll`. Never `page.evaluate` a
  value right after a click.
- **Access is asserted as of a moment.** Where a flow says access changed on the next request,
  reload and re-read. Never wait on a timeout, because a timeout hides a caching defect.
- **A toggling row is clicked once.** A second click turns it off. `retries` is 0 so a
  half-completed test is diagnosed, not re-clicked.

## Specs share a world, so do not mutate it

Every spec file a worker runs shares that worker's world.

- **Never add Quinn to anything.** He is the zero-access sentinel, and `harness.spec.js` asserts
  he reaches nothing. Membership rises through the hierarchy, so one real add makes him a member
  of every ancestor.
- **`mutationsOn` in `restrictions/archive.spec.js` is safe only while refused.** It adds Quinn.
  Its `PATCH` carries `version: 1`, so an allowed assertion works once per group. Any later
  PATCH gets a 409 version conflict, which also satisfies `expectConflict` for the wrong reason.
  To assert mutations allowed, send one PATCH and one invitation, as A4 does.
- **A grant on a dataset makes its owning group visible to the grantee.** Any spec that grants
  an outsider anything creates its dataset in `requestLab`, never in `lab`. Ask which group a
  grant opens up.
- **Membership specs create their own group** under the run's centre, named
  `${world.prefix}-…`.
- **A test that mutates a dataset creates it**, because grants accumulate and revocations are
  permanent. A new dataset holds one `DATASET:LIST_FILES` grant to its owning group.
- **Each request flow uses its own `lockedFor*` dataset.** `POST /access-requests` answers 409 for
  a duplicate or redundant request.

## Invitation tokens come from MailHog

No API returns a token. `src/world/mail.js` reads MailHog, which needs Redis, MailHog, and the
notification worker. **Take `mailMark()` before issuing the invitation and pass it as
`since`.** Without it the helper returns an older invitation for the same address, and the
stale token fails with "This invitation is no longer valid". Use `decodeBody` on a raw body.

## API shapes that cost a cycle

The full table is in the docs page. The ones that most often make a spec wrong:

- `GET /grants?resource_id=` is not a route. Use `GET /grants/resource/:resource_type/:resource_id`
  (`src/world/grants.js`). It takes no `limit` and groups by subject.
- `POST /access-requests` needs `submit: true`, or the row stays an unlisted `DRAFT`.
- Promotion is `PUT /groups/:id/admins/:userId`. `POST` answers 404, which `expectRefused` accepts.
- `GET /v2/datasets/:id` and `dataset_ids` take the resource UUID. The integer id is a 400.
- `GET /groups/:id/invitations` defaults to `PENDING`. Pass `status=all`.
- `POST /groups/:id/children` needs at least one named admin from a non-platform-admin caller,
  or 400. The creator is not appended.

## Driving the browser

- **`va-select` takes real Playwright input.** Click the select, then
  `getByRole('option', {name})`. The `setupState` workaround is for MCP synthetic events only.
  Do not locate a select by the value it shows, because the locator stops matching when it
  changes.
- **`VaCheckbox` puts `data-testid` on its wrapper.** Assert on
  `.locator('input[type="checkbox"]')` and click the wrapper. `uncheck()` on the input times out.
- **Assert both states of a disabled control**, `toBeDisabled()` then `toBeEnabled()`.
- Vuestic tabs are `getByRole('tab', {name})`.

**Selectors.** A `data-testid` is kebab-case, prefixed by the surface, and names purpose rather
than look (`grant-revoke-confirm`). A list row carries its id (`dataset-row-<id>`). Add a hook in
the same change as the spec that reads it, never speculatively.

**Recording routes for N1.** Before adding an entry to `CALLER_SCOPED` in
`src/assertions/replay.js`, show a stranger with a real id and with a never-issued id gets
indistinguishable replies.

## A disagreement is recorded with `test.fail()`

When a flow and the code disagree, write the assertion the flow states and mark it
`test.fail()`. It turns red when either side changes. Never rewrite a spec to match current
behaviour.

## Keeping this current

When a phase teaches something this page does not mention — a response shape that surprised
you, a spec that passed for the wrong reason, a world-design constraint — amend this file **in
the same commit as that phase**, rather than saving it for the end of the work. Verify a claim
against the running API before writing it down. Put background and full tables in
[docs/contributing/techniques/e2e-tests.md](../../../docs/contributing/techniques/e2e-tests.md),
and keep this file to what is needed immediately.

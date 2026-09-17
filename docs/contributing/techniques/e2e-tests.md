---
title: The v2 end-to-end suite
---

# The v2 end-to-end suite

`e2e/` is the Playwright suite for the groups and access-control flows. This page is the
reference behind the agent skill at `.claude/skills/e2e-tests/SKILL.md`. The skill holds the
traps to know before starting. This page holds the reasoning, the worked examples, and the
full tables.

- How to run the suite, sign in, and recover after a database reset: [e2e/README.md](https://github.com/IUSCA/bioloop/blob/main/e2e/README.md).
- What the suite must prove: [End-to-end test flows](../../design/groups/e2e-test-flows.md).

## The world

### Built through the API, torn down through SQL

Each worker builds its own world in `src/world/build.js`. It builds through the HTTP API as
the platform admin. A world assembled by direct inserts could be one the API would refuse,
such as a dataset with no resource row. Building through the API makes the fixture a check
that the creation paths work.

The suite creates no accounts. `borrowAccounts` borrows seeded `user-%` accounts that hold
only the `user` role and belong to no group. Creating an account would fire the
`USER_CREATED` hook that applies pending invitations, which is a path the invitation flows
test rather than a side effect every run should trigger. An account already in a seeded
group would carry standing the run did not give it.

Two accounts have a fixed meaning in `FIXED_ACCOUNTS` in `src/world/cast.js`. Priya is
`test_user`, the platform admin. Quinn is `ajohnson`, the zero-access user. The builder
excludes both from the borrow pool.

`src/world/teardown.js` removes the run's rows in one transaction. It goes around the API
because the API offers no `DELETE /groups/:id`, and `DELETE /v2/datasets/:id` keeps the record.
Adding a destructive endpoint to serve a test suite would put a hole in the model. The
order follows the foreign keys that RESTRICT: grants, then access requests, then
collections and datasets, then resources, then groups, then their subject rows. Ids are cast
to `text[]`, because Prisma declares these id columns as `String`.

`src/world/db.js` is the only direct database access. It serves teardown and the borrow
query. A spec that reads the database to check an outcome asserts against rows rather than
against what a person sees.

### Worlds are built one at a time

Two builds that overlap both read the unaffiliated-account list before either writes. Both
then borrow the same six people. `withWorldBuildLock` in `src/world/db.js` serialises builds
with a Postgres advisory lock. A build takes about a third of a second, so the lock costs
nothing.

`ASSIGNED_CAST` is also the borrow list, so a person appears in it exactly once. Extra group
memberships go in `EXTRA_STANDING`.

### The row census picks up other sessions

Counting rows before and after a full run is the check that teardown still works. Drift
means a new resource type needs a line in `teardown.js`. The database is shared, though. A
row another session wrote shows up as drift too. Before treating drift as a teardown bug,
check whether the rows carry the `e2e-` prefix.

The census also misses orphans from a probe script that threw before its own teardown,
because those rows existed both before and after the run. The skill has the query that
finds them.

### The servers are warmed once

`src/global-setup.js` compiles the first UI route and polls the API heartbeat before any
test runs. Vite compiles a route on its first request, which can take tens of seconds.
nodemon restarts the API whenever anybody saves a file under `api/`, including another agent
session in the same checkout.

## Refusal assertions

The helpers live in `src/assertions/parity.js`.

| Helper | Asserts | Use it when |
| --- | --- | --- |
| `expectRefused` | 401, 403, or 404 | The surface must be indistinguishable from "no such thing" |
| `expectForbidden` | 403 exactly, with a named failure on 400 | The claim is that a policy refused |
| `expectConcealed` | 404 exactly | The caller has no standing on the resource the URL names |
| `expectConflict` | 409 exactly | The resource's state refused, such as an archived group |
| `expectAllowed` | below 400 | The positive half of a pair |
| `expectNotForbidden` | not 403 | The positive half, where the handler may answer non-2xx for its own reasons |
| `expectAbsentButPresent` | a locator absent and another visible | The page form of the pair |

### A refusal without standing is 404

A caller with no standing on the dataset, collection, or group a URL names gets 404. An
unknown id gets the same answer. A caller who stands on the resource and is refused an action
gets 403. So does any call that names no resource, such as `POST /grants`. A route that
authorizes another container answers 403 whoever asks. `GET /grants/resource/DATASET/:id`
authorizes `grant` on the dataset id, so B4 and F10 assert 403 for a member of the owning
lab.

### Worked examples of an assertion that could not fail

- **Filtering before counting.** F3 checks that a grant of `DOWNLOAD` writes one row rather
  than three. "Filter the grants by `DOWNLOAD` and expect one" passes whatever the API does.
  The honest form counts everything the subject holds.
- **A substring of the JSON.** A G5 assertion written as
  `expect(JSON.stringify(summary)).toMatch(/revoked/)` passed before anything was revoked,
  because the summary contains `"revoked": 0`. `access_summary` on an access request is
  `{issued, live, revoked, expired, last_revoked_at, last_revocation_type, covered_elsewhere}`.
  The honest test asserts `live` before and after the revocation.
- **A 400 from any validator.** G1 requires the 400 and a body matching `/Expiry/`. It also
  asserts the request is still `UNDER_REVIEW` afterwards, because a route that crashed halfway
  is invisible to a status assertion.

### `test.fail()` records a disagreement

When a flow and the code disagree, write the assertion the flow states and mark it
`test.fail()`. It passes while the disagreement stands. It turns red when either side
changes, so amending the flow retires the spec just as fixing the code does. G3 was written
this way against an access-request enforcement hole, and it passed on its first run. That is
how the suite learned the hole was already closed.

### N1 is asserted by recording

`src/assertions/replay.js` drives a page as a permitted caller with the network recorded. It
then reissues every call as a stranger. Its `CALLER_SCOPED` list holds exemptions for routes
that answer about the caller rather than the resource. Before adding an entry, call the route
as a stranger with a real id and with an id that was never issued. The two replies must be
indistinguishable.

## State refusals: archiving

Archiving is the group's own state, not a permission. The state layer runs after
authorization, inside the transaction that performs the write. A refusal is therefore 409.

`restrictions/archive.spec.js` verifies the following. On an archived group, Alice is refused
every mutation with 409 while keeping every capability she had. Priya is refused the same
way. Every read still works for both, and existing grants keep working. Unarchive is Priya's
alone, and that refusal is authorization, so it is a 403 for a group admin.

Archiving does not propagate downward. A sub-group reports `is_archived: false` and accepts
mutations. A dataset the sub-group owns still takes a grant. A dataset the archived group owns
refuses a grant with 409, and the message names the owning group, because the dataset has no
archived state of its own. Flow A4 settles this.

@see docs/design/groups/decisions.md — 17. Resource state is checked after authorization

## Sharing a world between spec files

A worker's world is shared by every spec file that worker runs. Each rule below exists
because a spec failed in a file that did nothing wrong.

- **Membership specs build their own group.** A test that adds Frank to `lab` deletes the
  premise of a refusal spec in another file. The membership specs create a group per test
  under the run's centre. Teardown collects them because it deletes by the name prefix.
- **A test that mutates a resource creates it.** Grants accumulate and revocations are
  permanent, so two grant specs sharing a dataset make run order decide the outcome. A group
  admin may call `POST /v2/datasets`. Teardown collects these datasets by owning group.
- **A dataset is born holding one grant.** `seedOwningGroupGrant` issues
  `DATASET:LIST_FILES` to the owning group with `creation_type: SYSTEM_BOOTSTRAP`. This is
  decision 12, and it is what makes D2 possible.
- **Each request flow has its own dataset.** `POST /access-requests` answers 409 for a second
  pending request for the same access type, and for one covering access already held.
  `cast.js` carries one `lockedFor*` dataset per flow.
- **A grant on a dataset makes its owning group visible.** One `DATASET:VIEW_METADATA` grant
  to the sibling lab on a lab-owned dataset took Frank from 403 to 200 on the lab's own group
  page. `requestLab` owns every dataset the request and grant flows open to outsiders, and
  `lab` stays invisible to the sibling branch. Bob is a member of both groups. This bit twice:
  once from a fixture grant in `cast.js`, and once from F8 issuing a grant of its own.
- **Quinn is never added to anything.** `mutationsOn` in `restrictions/archive.spec.js` adds
  Quinn to a group, and is safe only while every use asserts a refusal. When A4 was inverted
  to assert a sub-group accepts mutations, Quinn became a real member. Membership rises
  through the hierarchy, so he became a transitive member of every ancestor.
  `harness.spec.js` then failed in the full run while passing alone.
- **A group's `PATCH` succeeds once.** `mutationsOn` sends `version: 1`, and
  `updateGroupMetadata` increments the version on success. A second PATCH with the same
  version answers 409 from the version check, which `expectConflict` cannot tell apart from a
  state refusal. A4 therefore asserts one PATCH and one invitation, neither of which outlives
  the test in a way another file can see.

## Invitation tokens and MailHog

No API returns an invitation token. `POST /groups/:id/invitations` answers `{status, id}`,
and the list route returns `invited_email` and `status`. A test that spends an invitation
reads MailHog's HTTP API through `src/world/mail.js`. That needs Redis, MailHog, and the
notification worker.

MailHog keeps every message until somebody empties it. Every address invited in an earlier
run already has an invitation in the mailbox. Without a `mailMark()` passed as `since`, the
helper returns the stale message before the new one is delivered. The stale token then fails
with "This invitation is no longer valid".

Bodies arrive quoted-printable, with `=3D` for `=` and soft line breaks. The HTML half
escapes `=` as `&#x3D;`. `decodeBody` undoes both.

## API shapes that are not what they look like

Each of these cost a debugging cycle. Verified against the routes in `api/src/routes`.

| Call | The trap |
| --- | --- |
| `GET /grants?resource_id=…` | Not a route, so 404. Use `GET /grants/resource/:resource_type/:resource_id`, which takes no `limit` and returns `{subject, grants}` groups. `src/world/grants.js` wraps it. |
| `GET /grants/resource/...` grouping | Grouped by subject: `{subject: {id, type, user, group}, grants: [...]}`. Use the grouping to count what one subject holds. |
| A grant's source request | `source_access_request`, a nested object. There is no `source_access_request_id`, and filtering on one matches nothing. |
| `GET /grants/:subject_type/:subject_id/:resource_type/:resource_id/coverage` | An array of rows carrying `access_type_name`, `via` (`DIRECT` or `GROUP`), and `via_group_id`. It lists what is held, not the narrower types the order implies. |
| `POST /access-requests` | Needs `submit: true`, which creates and submits in one transaction. Without it the row stays `DRAFT`, and no surface lists a draft. |
| `POST /access-requests/:id/review` | `approved_expiry` is required on an `APPROVED` decision and ignored on a `REJECTED` one. Omitting it is a 400 naming `Expiry`. |
| `POST /grants` | Each item needs `approved_expiry`, shaped `{type: 'never'\|'date', value}`. |
| `PATCH /groups/:id` | Requires `version` for optimistic concurrency. |
| `POST /groups/:id/members` | Takes `{members: [{user_id}]}`, not bare ids. |
| `POST /groups/search` | `limit` is capped at 100. |
| `PUT /groups/:id/admins/:userId` | Promotion is a PUT. `POST` answers 404, which `expectRefused` would accept. |
| `POST /groups/:id/children` | Authorizes `create_child` on the parent. The creator is not appended to the child's admins. A caller who is not a platform admin must name at least one admin, or gets 400. |
| `GET /groups/:id/invitations` | Defaults to `status=PENDING`, so an accepted invitation disappears. Pass `status=all`. |
| `POST /groups/:id/invitations` | Answers 400 for somebody who is already a member. |
| `POST /auth/invite/check` | Public, and answers `{status: 'valid'\|'invalid'}` only. A reason would make it an oracle. |
| `GET /groups/:id/members` | Current members only. A removed member's history is in `GET /groups/:id/audit` as `GROUP_MEMBER_ADDED` and `GROUP_MEMBER_REMOVED`. |
| `GET /v2/users/me` | Returns `{user, is_platform_admin, admin_group_count, oversight_group_count}`. The profile is nested. |
| `GET /v2/datasets/:id` | Wants the resource UUID. The integer `dataset.id` is a 400, and the page renders the same "Failed to load dataset" it shows for a refusal. |
| `POST /collections/:id/datasets` | `dataset_ids` are resource UUIDs. A cross-group dataset is refused with 400, not 403. |

## Driving the browser

### Selectors

The v2 tree carries seven `data-testid` hooks, and each exists because a spec reads it.
`error-state` in `components/utils/ErrorState.vue` covers the refusal region on every v2
surface that renders one. `dataset-list`, `dataset-detail`, `group-list`, `group-detail`, and
`collection-list` sit on the success branch of their pages, as the positive half of an
absence assertion. `creator-is-admin` sits on the create-subgroup checkbox.

A new hook follows three rules. It is kebab-case, prefixed by the surface, and names what the
element is for rather than how it looks. A list row carries the id of what it holds, such as
`dataset-row-<id>`. A hook lands in the same change as the spec that reads it.

Vuestic tabs render `role="tab"` on a `div`, so `getByRole('tab', {name: /Files/i})` works.

### `va-select` takes real input

`spike/va-select.spec.js` settles this. Playwright sends real input over the Chrome DevTools
Protocol, so a click on the select and then on `getByRole('option', {name})` changes the bound
value. The `setupState` workaround in the `v2-ui-changes` skill is for synthetic events from
Chrome DevTools MCP, and this suite does not need it.

A locator that filters `.va-select` on the value it currently shows stops matching when the
value changes. Playwright then reports "element(s) not found", which reads like a failed
click. Hold a select by its position within the modal, and assert on its text.

### Forms whose own state is the assertion

`membership/create-child.spec.js` asserts that the "I will be an admin" checkbox starts
checked and disabled, and becomes a choice once another admin is named. No API call can show
that.

- **`VaCheckbox` puts the test id on its wrapper.** `getByTestId('creator-is-admin')` is the
  wrapper, and `.locator('input[type="checkbox"]')` is what `toBeChecked()` and
  `toBeDisabled()` need. Click the wrapper to toggle it. `uncheck()` on the inner input times
  out, because `va-checkbox__square` intercepts pointer events. The wrapper carries
  `va-checkbox--disabled` while disabled.
- **Assert both states of a disabled control.** `toBeDisabled()` before the admin is named and
  `toBeEnabled()` after it make each half evidence.
- **`AutoCompleteSearch` renders "No results found".** A spec asserts somebody is missing from
  a search that way. The same search filled with another username must then find that person,
  or the first half proves only that search is broken.
- **`UserChip`'s remove control is named `Remove <name>`.** Use
  `getByRole('button', {name: /^Remove /})`.
- **`GET /v2/users?search=` matches name, email, and username,** but the result row renders
  `name || email`. Search by the username the world handed you and click by the display name.

### Retrying expectations and toggles

A click updates a ref, and Vue re-renders on the next tick. A read in the same step sees the
values from before the render, which looks like the click did nothing. `expect(locator)`
retries until it passes. A measurement that is itself the assertion goes inside `expect.poll`.

A row that toggles, such as an access-type row, must be clicked once. A second click turns it
back off. `playwright.config.js` sets `retries: 0` so a half-completed test gets diagnosed
rather than clicked twice.

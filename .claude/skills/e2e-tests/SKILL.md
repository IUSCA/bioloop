---
name: e2e-tests
description: Operational technique for the Playwright suite in e2e/ that covers the v2 groups and access-control flows - how a world is built and torn down, the API shapes that are not what they look like, and the several ways a refusal test passes while asserting nothing. Use when writing or running anything under e2e/, or when a boundary test behaves unexpectedly.
---

# The v2 end-to-end suite

`e2e/` is the browser-driven suite for the groups and access-control flows. It is separate
from `tests/`, which covers v1 and is organised around RBAC roles. The plan and the flow
catalogue it implements are
[e2e-test-plan.md](../../../docs/design/groups/implementation/e2e-test-plan.md) and
[e2e-test-flows.md](../../../docs/design/groups/e2e-test-flows.md); this page is the
operational half.

```bash
cd e2e && npx playwright test                      # everything
npx playwright test src/specs/refusal --workers=1  # one area, serially
```

## The suite builds its own world and does not read the seeded one

`api/prisma/seed_data/flows_world.js` seeds a named cast — `alice`, `frank`, `quinn` and the
rest — so the flows can be walked by hand at `/dev-login?username=alice`. **The suite does not
use it.** A spec that hard-codes a seeded identity fails whenever somebody edits the seed.

Each worker builds its own world through the HTTP API (`src/world/build.js`), names every row
`e2e-<runId>-*`, and removes them afterwards by SQL (`src/world/teardown.js`). Teardown goes
around the API because there is deliberately no `DELETE /groups/:id`.

Prove teardown still works by counting rows before and after a full run. Every table should be
unchanged; drift means a new resource type needs a line in `teardown.js`.

## Three ways a refusal test passes while asserting nothing

This is the core hazard of the whole suite, and each of these shipped green before being
caught.

**A 404 that is not a refusal.** `expectRefused` accepts 401, 403 and 404, which is right for
a surface meant to be indistinguishable from "no such thing" and far too loose where the point
is that a *policy* refused. A route that 404s for everybody — or one that was renamed, or
never mounted — satisfies it. Use `expectForbidden` (403 exactly) whenever the claim is about
enforcement.

**A 400 that is not a refusal.** `express-validator` runs *before* the authorization
middleware, so a malformed body is rejected without the policy ever being consulted. Four
governance specs were written with a wrong payload and refused for that reason.
`expectForbidden` now fails with a message naming this case specifically.

**A refusal with nothing to compare it to.** Every refusal assertion needs a caller who is
*allowed*, on the same route, in the same test — `expectNotForbidden` where the handler may
legitimately answer non-2xx for its own reasons. Without it, a broken route reads as a policy
working perfectly. `expectAbsentButPresent` is the same rule for pages.

A worked example of why this is not theoretical: `GET /v2/datasets/:id/files` used to answer
404 to a platform admin, because the fixture dataset held no file rows. The stranger's refusal
was real but unprovable, and the spec asserted nothing until the positive half was added.

**A fourth way, which is subtler: an assertion that could not have failed.** F3 checks that a
grant of `DOWNLOAD` writes one row rather than three. Written as "filter the grants by
`DOWNLOAD` and expect one", it passes whatever the API does — had three rows been written, the
filter would still return exactly one. The honest form counts everything the subject holds.
Before trusting a green assertion, ask what data would have made it red.

## Invitation tokens come from MailHog, and stale mail is the trap

No API returns an invitation token — `POST /groups/:id/invitations` answers `{status, id}` and
the list route returns `invited_email` and `status`. That is correct: the token belongs in the
email. So a test that spends an invitation reads MailHog's HTTP API (`src/world/mail.js`),
which needs Redis, MailHog, and the notification worker running.

**Take a `mailMark()` before issuing the invitation and pass it as `since`.** MailHog keeps
every message until somebody empties it, so any address invited before — every real seeded
account, across every previous run — already has an invitation sitting in the mailbox. Without
the mark, the helper returns the moment it sees *an* email for the address, which is the old
one, because the new one has not been delivered yet. Sorting newest-first does not save you:
the newest message *present* is still the stale one until delivery catches up. The stale token
then fails with "This invitation is no longer valid", which reads as the invitation system
being broken.

Bodies arrive quoted-printable (`=3D` for `=`, soft line breaks) and the HTML half escapes `=`
as `&#x3D;`. A regex run against the raw body finds a token with characters missing, which
then fails to apply. `decodeBody` undoes both.

## A probe script that throws leaves its world behind

Ad-hoc `node -e` scripts that call `buildWorld` are the fastest way to learn an API shape, and
they skip their own teardown when they throw — which is exactly when you are using them. The
suite's row census will not notice, because the rows were there before the run as well as
after. Check for orphans and clear them by run id:

```bash
node -e "const {query}=require('./src/world/db'); query(\"SELECT name FROM \\\"group\\\" WHERE name LIKE 'e2e-%'\").then(r=>r.forEach(x=>console.log(x.name)))"
node src/world/teardown.js <runId>
```

## The row census picks up other sessions

Counting rows before and after a run is the check that teardown still works, but the database
is shared. A run once showed `restriction` drifting 1 → 2; the row belonged to a
`test-group-abc` somebody else had just archived, and the suite had left zero `e2e-%` groups
behind. Before treating drift as a teardown bug, check whether the rows carry the run's own
prefix.

## Assert the shape, not a substring of the JSON

A G5 assertion written as `expect(JSON.stringify(summary)).toMatch(/revoked/)` went green
*before* anything was revoked, because the summary contains `"revoked": 0`. Read the actual
field. `access_summary` on an access request is
`{issued, live, revoked, expired, last_revoked_at, last_revocation_type, covered_elsewhere}`,
and the honest test asserts `live` before and after the revocation.

## API shapes that are not what they look like

Verified against the running API. Each of these cost a debugging cycle.

| Call | The trap |
| --- | --- |
| `GET /grants?resource_id=…` | **Not a route.** 404. Use `GET /grants/resource/:resource_type/:resource_id`, which takes no `limit` (a 400 if you send one) and returns `{subject, grants}` groups, not a flat list. `src/world/grants.js` wraps it. |
| A grant's source request | `source_access_request`, a nested object. There is no `source_access_request_id` in the response, and filtering on one silently matches nothing. |
| `POST /access-requests` | Needs `submit: true`, which creates and submits in one transaction. Without it the row stays `DRAFT`, and no surface lists a DRAFT. `useRequestAccessForm.js` sends the flag; a spec that omits it is testing a state the product never produces. |
| `POST /access-requests/:id/review` | `approved_expiry` is required on an `APPROVED` decision and ignored on a `REJECTED` one. Omitting it is a 400 naming `Expiry`; it used to be a 500, which is what L2 T18 was. |
| `POST /grants` | Each item needs `approved_expiry`; an expiry is `{type: 'never'|'date', value}`. |
| `PATCH /groups/:id` | Requires `version` for optimistic concurrency. |
| `POST /groups/:id/members` | Takes `[{user_id}]` objects, not bare ids. |
| `POST /groups/search` | `limit` is capped at 100. |
| `PUT /groups/:id/admins/:userId` | Promotion is a **PUT**. `POST` is not a route there and answers 404 — which "refused" would accept. |
| `POST /groups/:id/children` | Authorizes against the **parent**, so the creator must already administer it. It also appends a non-platform-admin creator to the child's `admins` (L1 T11). |
| `GET /groups/:id/invitations` | Defaults to `status=PENDING`, so an invitation that was accepted simply disappears. Pass `status=all` to follow one past its acceptance. |
| `POST /groups/:id/invitations` | Refuses a **400** for somebody who is already a member — the escalation path C4 describes never opens. |
| `POST /auth/invite/check` | Public, and answers `{status: 'valid'\|'invalid'}` and nothing else. A reason would make it an oracle for someone else's invitation. |
| `GET /groups/:id/members` | Current members only. A removed member is gone from it; the record of their membership lives in `GET /groups/:id/audit` as `GROUP_MEMBER_ADDED` / `GROUP_MEMBER_REMOVED`. |
| `GET /v2/users/me` | Returns `{user, is_platform_admin, admin_group_count, oversight_group_count}`; the profile is nested. |
| `GET /grants/:subject_type/:subject_id/:resource_type/:resource_id/coverage` | An **array**, each row carrying `access_type_name`, `via` (`DIRECT` or `GROUP`) and `via_group_id`. It lists what is actually held, not the narrower types the order implies — so a subject holding `DOWNLOAD` shows one row, not three. |
| `GET /grants/resource/...` grouping | Grouped by subject: `{subject: {id, type, user, group}, grants: [...]}`. Use the subject grouping to count what one subject holds; filtering a flat list by access type cannot answer "one row or three". |
| `GET /v2/datasets/:id` | Wants the **resource UUID**. The integer `dataset.id` is a 400, and the page renders the same "Failed to load dataset" it shows for a refusal. |
| `POST /collections/:id/datasets` | `dataset_ids` are resource UUIDs despite the name. A cross-group dataset is refused **400**, not 403 — the caller is legitimate, the request is not. |

## The API refuses duplicate and redundant requests, so give each flow its own dataset

`POST /access-requests` answers 409 for a second pending request naming an access type already
asked for, and for one covering access already held. Both are correct. The consequence for the
suite is that request-loop specs cannot share a dataset: whichever ran first decides whether
the next can begin, and the failure appears in a spec that did nothing wrong. `cast.js` carries
one `lockedFor*` dataset per flow.

## A grant on a dataset makes its owning group visible

Measured: adding a single `DATASET:VIEW_METADATA` grant to the sibling lab on one lab-owned
dataset took Frank from 403 to 200 on the **lab's own group page**, breaking a refusal spec in
a different file.

So a dataset that some outsider must be able to see cannot live in a group that a boundary
spec asserts is invisible. The world keeps them apart: `requestLab` owns everything the
request and grant flows need to be reachable, and `lab` stays a group the sibling branch
cannot see. Bob is a member of both, so a flow that needs "an ordinary member of the owning
group" still has somebody to assert about without putting its dataset in `lab`.

**This bites twice, from opposite directions.** The first time was a fixture grant in
`cast.js`. The second was a spec issuing a grant of its own — F8 hands the sibling lab
download on the dataset under test — which reaches the same place with nothing in `cast.js`
changed. Any spec that grants an outsider anything must create its dataset in `requestLab`.
Ask not what the grant confers, but which group it opens up.

## `test.fail()` is how a disagreement is recorded

When a flow and the code disagree, write the assertion the *flow* states and mark it
`test.fail()`. It passes while the disagreement stands and turns red the moment it is
resolved — in either direction, which is the point: amending the flow should retire the spec
just as fixing the code should. A spec quietly rewritten to match current behaviour records
nothing, and a flow simply left out records less.

This has paid twice. G3 was written as an expected failure against an access-request
enforcement hole and passed on its first run, which is how the suite learned the hole was
already closed. A1's authority half is an expected failure today: `POST /groups/:id/children`
appends a non-platform-admin creator to the child's `admins`, so a centre admin governs every
group she creates, while flow A1 says creating a child confers oversight and not authority.

## Archiving refuses with 409, and a platform admin is refused the same way

Archiving is the group's own state, not a permission and not a restriction composed with the
policies. The state layer runs after authorization, inside the transaction that would perform the
write, so a refusal is **409** and `expectForbidden` fails against it. Use `expectConflict` from
`src/assertions/parity.js`, and pair it with `expectAllowed` on something whose state does admit
the action, or a route that answers 409 to everything would satisfy it.

Verified: on an archived group, Alice is refused every mutation with 409 while keeping every
capability she had, Priya is refused identically, every read still works for both, existing grants
keep working, and unarchive is Priya's alone — that last one is authorization, so it stays a 403
for a group admin.

**Archiving does not propagate downward.** It covers the group and what it owns, one step. A
sub-group keeps its own state: it reports `is_archived: false` *and* accepts mutations, and a
dataset the sub-group owns still takes a grant. What freezes alongside the group is what the group
itself owns — a dataset owned by the archived group refuses a grant with 409, and the message names
the owning group, because the dataset has no archived state of its own. An earlier version of this
page said the opposite, and flow A4 is the test that settles it.

@see docs/design/groups/decisions.md — 17. Resource state is checked after authorization

## Inverting a refusal into a success turns a read-only helper into a write

A helper shared by refusal specs is safe precisely because nothing it builds is ever written: the
call is refused, so the body never lands. Assert the same call *allowed* and the helper becomes a
mutation, and it mutates the world every other spec file in that worker shares.

Measured here. `mutationsOn` in `restrictions/archive.spec.js` adds Quinn to a group, and every
use of it asserted a refusal. Flow A4 was rewritten to assert a sub-group still accepts its
mutations, which put Quinn in a group for real; membership rises through the hierarchy, so he
became a transitive member of every ancestor and reached the run's dataset through the owning
group's seeded grant. `harness.spec.js` asserts Quinn reaches none of this run's resources, and it
failed in the full run while passing on its own — the signature of exactly this.

**Two rules follow.** Never add the zero-access sentinel — Quinn — to anything; his whole value is
that nothing connects him. And when flipping a refusal assertion to a success, read what the body
would actually write, rather than reusing the fixture that was safe while it was being refused.
Prefer writes that expire with the test: an invitation confers nothing until accepted, and a
description `PATCH` touches only the group under test.

## Membership specs build their own group

A worker's world is shared by every spec *file* that worker runs, so a membership test that
adds Frank to `lab` deletes the premise of a refusal spec in another file, and whichever ran
second fails. Membership is the thing under test in phase 5, so those specs create a group per
test under the run's centre. Teardown collects them because it deletes by name prefix, and an
in-test group named `${world.prefix}-…` matches.

## Create the resource in the test, not in the world, when the test mutates it

Grants accumulate on a resource and revocations are permanent. Two grant specs sharing a
fixture dataset make the order they ran in decide the outcome, and the failure surfaces in
whichever spec ran second, which did nothing wrong. Phase 4 creates a dataset per test — a
group admin may call `POST /v2/datasets` — and teardown collects them because it deletes by
owning group rather than by name.

A dataset is born holding exactly one grant: `DATASET:LIST_FILES` to its owning group, with
`creation_type: SYSTEM_BOOTSTRAP`. That is decision 12, and it is what makes D2 possible —
revoking it removes every member's access while leaving the group's governance untouched.

## Worlds are built one at a time

Workers choose their accounts by asking which seeded users belong to no group. Two builds
overlapping both read that list before either writes, so both borrow the same six people and
Alice in one world is Alice in the other. `withWorldBuildLock` in `src/world/db.js` serialises
builds with a Postgres advisory lock; a build costs about a third of a second, so this is free.

`ASSIGNED_CAST` is also the borrow list — one seeded account per entry — so a person must
appear in it exactly once. Extra group memberships go in `EXTRA_STANDING`.

## The servers are warmed once, and the API restarts under you

`src/global-setup.js` compiles the first UI route and polls the API heartbeat for up to a
minute before any test runs. Both halves earn their place: Vite compiles a route on first
request, which can take tens of seconds, and nodemon restarts the API whenever **anybody**
saves a file under `api/` — including another agent session in the same checkout. Four
consecutive runs died on that while the server itself was healthy.

## Selectors

Six `data-testid` hooks exist, and that is deliberate rather than a starting point.
`components/utils/ErrorState.vue` carries `error-state`, which covers the refusal region on
every v2 surface that renders one; the five pages the flows name carry a hook on their
*success* branch, which is the positive half of an absence assertion.

Vuestic tabs render `role="tab"` on a `div`, so `getByRole('tab', {name: /Files/i})` works.

## N1 is asserted by recording, not by an inventory

`src/assertions/replay.js` drives a page as a permitted caller with the network recorded, then
reissues every call as a stranger. Flow N1 names "any programmatic route the browser itself
calls", which nobody can keep accurate by hand.

Its `CALLER_SCOPED` list is the dangerous part: every entry is an exemption, and exemptions are
how a test like this stops testing anything. Before adding one, show that the route answers
about the *caller* rather than the resource — call it as a stranger with a real id and with an
id that was never issued, and require the replies to be indistinguishable. Both current entries
were admitted that way.

## A 400 assertion has to name the field, or any validator satisfies it

Asserting a bad request is refused is as weak as asserting a stranger is refused: a route with
a dozen validators answers 400 for a dozen reasons, and the spec passes on whichever fires
first. `api.raw()` returns `{status, body}`, so assert both — G1 requires the 400 *and* a body
matching `/Expiry/` before it accepts that the expiry validator is what refused it.

The same call also asserts that the refused review changed nothing: the request is still
`UNDER_REVIEW` afterwards. A route that crashed halfway is the failure mode a status assertion
alone cannot see.

## Driving a form, when the assertion is about the form's own state

Most of the suite talks to the API and uses the browser only to prove a page refuses. Two specs
in `src/specs/membership/create-child.spec.js` are the exception: the create-subgroup form's
"I will be an admin" checkbox starts checked and **disabled** and becomes a choice once another
admin is named, and no API call can show that.

What made them work, after the selectors were found by running them rather than by reading:

- **Give the control a `data-testid` and read the input inside it.** Vuestic's `VaCheckbox`
  passes an unknown attribute to its root wrapper, not to the `<input>`, so
  `getByTestId('creator-is-admin')` is the wrapper and
  `.locator('input[type="checkbox"]')` is what `toBeChecked()` and `toBeDisabled()` need.
  **Click the wrapper to toggle it.** Measured: `uncheck()` on the inner input times out with
  "`<div class="va-checkbox__square">` intercepts pointer events", because the real input is a
  1x1 box behind the drawn square. The wrapper also carries `va-checkbox--disabled` while the
  control is disabled, if a spec ever needs the class rather than the attribute.
- **Assert both states of a disabled control in one spec.** `toBeDisabled()` alone passes if the
  selector is wrong in a way that resolves to nothing surprising, and passes forever if the
  attribute is never set. Asserting `toBeDisabled()` before the admin is named and
  `toBeEnabled()` after it is what makes each half evidence.
- **`AutoCompleteSearch` renders "No results found"**, which is how a spec asserts that somebody
  is *missing* from a search — here that the signed-in user cannot pick themselves. Fill the
  search with their own username and expect that message; the same search filled with somebody
  else's username must then find them, or the first half proved only that search is broken.
- **`UserChip`'s remove control is named `Remove <name>`**, so
  `getByRole('button', {name: /^Remove /})` removes a selected chip. There is no class to
  target.
- **`GET /v2/users?search=` matches name, email, *and* username** (`services/user.js:144`), but
  the result row renders `name || email`. So search by the username the world handed you and
  click by the display name, which a spec has to look up.

## A refusal without standing is 404

A caller with no standing on the dataset, collection, or group a URL names gets 404, the answer an
unknown id gets. A caller who stands on it and is refused an action gets 403, and so does any call
that names no resource, such as `POST /grants`. A route that authorizes another container gets
403 whoever asks: `GET /grants/resource/DATASET/:id` authorizes `grant` on the dataset id, so B4
and F10 assert 403 for a member of the owning lab. `expectConcealed` in `src/assertions/parity.js` asserts 404
exactly, and `expectForbidden` still asserts 403. Pair `expectConcealed` with a caller who reaches
the same URL, because a 404 alone could be a route that was never mounted.

The suite borrows the flows cast from `api/prisma/seed_data/flows_world.js`. The demo world the
development database usually holds has no `priya`, so the suite cannot run against it until the
flows world is seeded.

## Keeping this current

When a phase teaches something this page does not mention — a response shape that surprised
you, a spec that passed for the wrong reason, a world-design constraint — amend this file **in
the same commit as that phase**, rather than saving it for the end of the work. Verify a claim
against the running API before writing it down.

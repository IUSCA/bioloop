# Access and requests plan

The ordered work for [epic #8](https://github.com/IUSCA/cdmd/issues/8): requesting, reviewing,
and managing access across datasets and collections.

The design record is [Access presets](./access-presets.md) for the grant layer and
[Decisions](./decisions.md) for the governance model. This page carries only the sequence, the
scope boundary, and the reasons for each. [Use Cases](./use-cases.md) says which items the
first release needs.

## The loop this closes

One complete pass: a researcher who can see a dataset asks for it, an admin reviews the
request and sees what the approval will confer, the decision reaches the requester, and both
sides can tell what access exists afterwards.

Everything below serves that loop. Collections come along nearly free, because the review
queue and the review modal are keyed on a request id and never on a resource type.

## What already exists

Every endpoint is built and authorized. Create, submit, review, and withdraw are routed, and
so are the three list queries `/requested-by-me`, `/my-pending-reviews`, and `/reviewed-by-me`.

Grant presets are complete. They are modeled in `grant_preset` and `grant_preset_item`, scoped
by resource type, persisted as request items, and expanded at approval with supersession.
`POST /grants/compute-effective-grants` gives a reviewer a dry run of an approval.

The Access tab works on both resources, with `IssueGrantModal` behind it.

## Where the loop is severed

Four breaks, all in the UI, and each was confirmed by reading the code rather than the
backlog.

**Creation never submits.** `useRequestAccessForm.submit()` calls `accessRequestService.create`
and never calls `submit(id)`. A request made through the UI lands in `DRAFT` and stays there.
Nothing reaches `UNDER_REVIEW`, so the pending queue is empty by construction.

**The review flow is unreachable.** `pages/v2/access-requests/index.vue` imports
`AccessRequestReviewModal.vue`, which is eighteen lines rendering the literal string
`Review Modal Stub`. The real `ReviewRequestModal.vue` is 298 lines, complete with the decision
form, the item rows, and the effective-grants preview, and it is imported by nothing.

**The request card renders no controls.** `AccessRequestCard.vue` is 25 lines showing a title
and a status. Three call sites pass it `@approve`, `@reject`, `@view`, `:can-act`, and
`:can-review`. All are ignored.

**The collection tab never fetches.** `CollectionRequestsTab.fetchRequests` opens with
`if (!props.collectionId) return`, and the prop is named `collection`. It returns before it
queries, `loading` never clears, and the tab renders an empty div.

The dataset tab is broken differently. It binds `@click="openIssueGrantModal"`, which the
component does not define, and the dataset page calls `openRequestAccessModal`, which it does
not expose.

## One enforcement hole blocks everything else

`authorize('access_request', 'create')` is `Policy.always`. `createAccessRequest` validates the
subject and never checks the resource, so a user holding any resource UUID can file a request
against a dataset they cannot see. `assertGrantItemsApplicableToResourceType` runs on grant
creation and not here, so a request may also name access types that do not apply to the
resource type.

Use case 5 states the test directly: a request against a dataset the requester cannot see is
refused. This lands before the request tabs reach anyone who is not an admin.

## Scope

### In

Phases A through D below. The loop closes for both resource types, the enforcement hole is
shut, and the two surfaces that mislead about access are corrected.

### Out, and why

**The oversight review queue.** The upstream issue asks whether oversight should see pending
reviews and leaves it open. Nothing in [Use Cases](./use-cases.md) marks it as needed for the
first release. The `hasOversightOfResourceGroup` policy already admits oversight to read one
request, so the gap is a queue query and a read-only variant of every control, not a model
change.

**A pre-submit validation endpoint.** Running the subject checks ahead of submission so the
dialog can block a doomed request is worth having. A 403 that names what failed covers it once
phase A1 lands, and the endpoint can follow if the message proves insufficient.

**Intra-preset partial approval.** A reviewer who wants only part of a preset must reject the
preset item and add the access types individually. This is risk 6 in
[Trust and communication](./trust-and-communication.md), and the access-type order shrank it:
issuance reduces a preset to the types the order does not already supply, so no seeded preset
is worth more than two grants. Fixing what remains means approval with exclusions, which
changes the request item model.

**Empty states that distinguish "no access" from "no results".** Risk 8 needs the query layer
to report that rows were filtered out, which touches every listing rather than this epic.

**Renewals and requests on behalf of a group.** Both are marked `Next` in
[Use Cases](./use-cases.md). The route rejects any type but `NEW`, and the renewal-context
endpoint is commented out.

## Phase A — Correctness before reach

### A1 — Request creation is gated on the resource

`access_request.create` stops being `Policy.always`. The route resolves the resource, then
authorizes `view_metadata` on it, because posture B.5 in [Use Cases](./use-cases.md) says a
dataset can be asked for when the requester can already see its metadata.
`assertGrantItemsApplicableToResourceType` runs on the request items as it does on grant
creation.

The seeded `DATASET:REQUEST_ACCESS` and `COLLECTION:REQUEST_ACCESS` access types stay unused.
They exist for a later posture where the right to ask diverges from the right to see, and
nothing needs that separation yet.

The check cannot go in the `authorize()` middleware. The create body carries `resource_id` and
no `resource_type`, so which policy container applies is not known until the `resource` row is
read. The route therefore reads the resource, then calls `authorizeAction` inside the handler
with `dataset` or `collection` and the action `view_metadata`, passing `req.policyContext` so
the caller is hydrated once. `POST /v2/datasets/bulk` already authorizes this way.

`access_request.create` stays in the container as `Policy.always`, which the plan first said
to remove. Removing it would have deleted a live path: `restrictionTargetFor` follows an
access_request through to `preFetchedResource.resource_id`, so the binding is how an ARCHIVED
restriction reaches request creation, and it was simply unwired. The route now supplies
`preFetchedResourceFn: (req) => ({ resource_id: req.body.resource_id })`, so a request against
a dataset in an archived group is refused with the restriction named. The policy half is
`Policy.always` with a comment saying the meaningful check is on the resource and lives in the
handler.

*Files:* `authorization/builtin/policies/access_request.js`, `routes/access_requests.js`.
*Reuse:* `authorizeAction`, and `assertGrantItemsApplicableToResourceType`.

Tested by `tests/routes/access_requests.create.test.js`, which mounts the router on a bare
express app with `req.user` set by the test rather than by the authentication middleware. Four
cases: a non-member is refused, an owning-group admin is not, an unknown resource id is a 404,
and a `COLLECTION` access type on a dataset is a 400.

## Phase B — Close the loop

Six steps, in this order. B5 comes before B6 deliberately: deleting the drafts UI removes six
of the fifteen `.value` readers B6 has to move, so the form rewiring touches two files rather
than three.

### B1 — Creating a request submits it

`POST /access-requests` takes `submit: true` and performs the create and the
`DRAFT → UNDER_REVIEW` transition inside one transaction. The state machine keeps both states
and both audit events; only the round trip disappears.

Chaining two calls in the client was the alternative. It is rejected because a failure between
them strands a `DRAFT` row that no surface can see or resume, once the drafts UI is gone.

Both service functions opened their own transaction, so the bodies split out first.
`createAccessRequest` and `submitRequest` are each a thin wrapper over a `tx`-taking
`_createAccessRequest` and `_submitRequest`, and `createAndSubmitAccessRequest` runs both in
one transaction. `submitRequest` also did two pre-flight reads outside its transaction,
`_getRequestById` and `_assertNoInFlightRequests`; both take a client argument and both moved
inside.

The form also never sent `type`, which the route requires and only accepts as `NEW`, so the
create call would have been rejected before it reached the submit gap.

*Files:* `services/access_requests/request.js`, `services/access_requests/index.js`,
`routes/access_requests.js`, `useRequestAccessForm.js`, `services/v2/access-requests.js`.

Tested by `tests/services/access-requests/access-request.create-and-submit.test.js`: the
request lands `UNDER_REVIEW`, both audit events are written, and a submit that throws leaves
no request behind.

### B2 — One request card

`AccessRequestCard.vue` is rebuilt against one contract: it takes `request` and `canAct`, and
emits `review` and `view`. All three call sites move to it, and the two prop names in use
today, `canAct` and `canReview`, collapse into the first.

The card carries the requester, the subject, the resource, the status, and the item count. It
is a list row, so the decision detail belongs on B3's page rather than here. The whole row
opens the request; the Review button is offered only when the viewer may act and the request
is `UNDER_REVIEW`.

Both resource tabs bind `view` here and pick up `review` in B4, when there is a modal for it
to open. The queue page already had an opener.

*Files:* `components/v2/access-requests/AccessRequestCard.vue`, and its three call sites.

### B3 — The request detail page

`pages/v2/access-requests/[id].vue`. Nothing renders one request today: `viewRequest` in the
queue pushes to `/access-requests/:id`, which is a legacy path that does not exist, so the
link is a 404.

The page shows the request, its items with their decisions, and the effective-access summary
C4 adds. It is the surface C3's requester-facing half needs, and the one a notification can
link to.

The page offers Review when the viewer may decide, and Withdraw when it is the viewer's own
open request. `GET /access-requests/:id` therefore derives capabilities, because the three
policies that admit a reader are not the one that admits a reviewer: a requester and an
oversight holder can both read a request neither may decide.

*Files:* `pages/v2/access-requests/[id].vue`, `routes/access_requests.js`.
*Reuse:* `RequestContextHeader.vue`, `Badge.vue`, and `GET /access-requests/:id`.

### B4 — The review flow is reachable

`ReviewRequestModal.vue` is wired into `pages/v2/access-requests/index.vue` and both resource
tabs. `AccessRequestReviewModal.vue`, the eighteen-line stub, is deleted.

The modal takes `requestId` as a required prop and exposes `show()`, while the queue called
`reviewModal.value?.show?.(request, action)` with arguments the modal ignores. Each surface
now holds a `reviewingId` ref and renders the modal under `v-if`, so each request gets a
fresh instance rather than a stale one.

Wiring it was not enough, because the modal did not work. Four defects sat behind the stub,
and every one of them was invisible while nothing rendered it.

`useReviewRequestForm` returned its refs inside a plain object, the same shape B6 fixes on
the request side. The modal held that object in a `ref` and read `formState.value`, which
resolved to `undefined`, so `v-if="request && formState?.value"` was never true and neither
the decision form nor the preview ever rendered. The composable returns `reactive()` now.

`ReviewRequestForm` kept the decision reason in a local ref and never wrote it back, so
`isSubmitEnabled` stayed false however much the reviewer typed.

Four readers expected a flat `request.resource_type`, which the API does not return: the
resource arrives as a row carrying its own `type`. The modal derives `resourceType` and
`subjectType` once and passes them down. Without it the access-type and preset fetches
returned early, so the preview showed ids with no names.

`ReviewItemRow` read `preset.access_types`, and a preset's types arrive as
`preset.access_type_items` join rows, so the pills naming what a preset covers never
rendered.

*Files:* the queue page, both resource tabs, `ReviewRequestModal.vue`,
`ReviewRequestForm.vue`, `ReviewItemRow.vue`, `ReviewEffectiveGrantsPreview.vue`,
`useReviewRequestForm.js`, one deletion.

### B5 — The drafts UI is deleted

`RequestAccessModal.vue`, `DraftRequestPicker.vue`, and `useAccessRequestDrafts.js` total 473
lines and are imported by nothing. The decision that the UI shows no drafts is already taken,
and B1 removes the last reason a draft could appear.

`RequestAccessModalWithoutDrafts.vue` then takes the name `RequestAccessModal.vue`, because
with the drafts variant gone the qualifier names a distinction that no longer exists. Its
dead `@saved` handler goes with it: `RequestAccessForm` declares no emits.

### B6 — The two resource tabs, and the form's state wiring

`DatasetRequestsTab` gets the request-access modal and exposes the opener the dataset page
already calls. `CollectionRequestsTab` loses the `props.collectionId` guard that stops it
fetching.

The capability name is unified in the same change. `dataset.review_access_requests` and
`collection.review_requests` name one concept, and the epic's goal is a consistent interface
across the two resources. `review_access_requests` wins, because `review_requests` inside a
collection policy does not say requests for what. Four files hold the two names, and the
restrictions test catches any call site missed.

The form's state wiring is fixed here too, and it is worse than the four breaks above.
`useRequestAccessForm` returns its refs inside a plain object, so `formState.subject` in a
template is the ref rather than its value. Half the readers know this and write
`formState.conflictError.value`; the bindings do not, and `v-model="formState.subject"`
replaces the ref on an object nothing is tracking. The composable never sees the subject, so
`isFormValidForSubmit` stays false and the form cannot be submitted at all.

Returning `reactive({...})` fixes the bindings and breaks every `.value` reader, so the two
halves move together. After B5 that is nine readers across two files.

The form and the modal each built their own instance of the composable, so even a fixed
composable would not have helped: the Submit button read a state the form never filled in.
The modal owns the one instance and passes it to the form.

A 409 also read as success. `submit()` swallowed the conflict and resolved `undefined`, and
the modal toasted "submitted for review" over a request that does not exist. It returns null
on a conflict now, and the modal leaves the dialog open with the form's own alert showing.

*Files:* both resource tabs, `useRequestAccessForm.js`, `RequestAccessForm.vue`,
`RequestAccessModal.vue`, both policy files, `restrictions.js`, both resource pages.

### What the browser pass found

The whole loop was driven end to end on both resource types, as an ordinary user filing a
request and as the owning group's admin deciding it. Five further defects surfaced, each one
on the path and none of them visible from the code alone.

`getDatasetById` destructured a required options bag, and `grant.js`'s
`getResourceOwningGroupId` calls it with the id alone. Every authorization path reaching it
threw a TypeError and returned a 500. The bag is optional now.

The coverage route bound `grant.list_for_resource`, which admits only the resource group's
admins and oversight, so the requester's own Current Access panel was a 403 for exactly the
person it is for. The question names both a subject and a resource, so either side's
authority answers it, and neither existing action covers both. `grant.view_coverage` is that
action.

`isSubject` compared `user.id`, an integer primary key, against a subject UUID, so the policy
was unsatisfiable and every caller fell through to the next arm.

The `access_request` hydrator filtered the `access_requests` relation with `has`, which
Prisma accepts only on a scalar list. `GET /access-requests/:id` was a 500 for every
non-platform-admin, and so were review, submit, and withdraw.

The queue page sorts the Reviewed tab by `reviewed_at`, and the route accepted only
`created_at` and `updated_at`, so that tab always returned a 400.

`ReviewRequestForm` used `i-mdi-close-all`, which the icon set does not carry, so importing
the component failed the Vite transform outright.

## Phase C — Tell the truth about access

### C1 — Effective coverage is one server-side question

`getEffectiveCoverage` answers which live grants reach a subject on a resource, through every
path, with each grant labelled by how it arrives. It is the query the three surfaces below all
need, and it is written once.

The union is the same one the authorization layer already uses in `userDatasetsQuery`: the
subject itself, the groups it inherits from, the system principals, and, for a dataset, any
collection holding it. A user subject inherits from `effective_user_groups`; a group subject
inherits from its ancestors in `group_closure`. One query serves both, because the arm that
does not apply returns no rows.

*New:* one service function. *Reuse:* the union already written in
`services/grants/helpers.js`.

### C2 — Both previews ask the union question

Neither preview does today, and both mislead the same way. `fetchExistingGrants` and
`getGrantsForSubjectAndResource` match on the exact `subject_id`, so a grant the subject holds
through a group is invisible on both sides.

A reviewer approving a personal `DOWNLOAD` for a user whose lab already holds `DOWNLOAD` until
2027 sees "1 new grant". The coverage is never mentioned, so the reviewer cannot decline as
redundant.

The write path keeps matching on the exact subject. A grant is issued to one subject, and a
group's grant cannot be superseded when approving a member. The coverage is therefore
advisory: it names what already reaches the subject and changes no decision by itself.

### C3 — Case 2 names the grant that covers it

When an approved access type is already covered by a broader grant, no grant is written. The
reviewer's preview says so and now names the covering grant, including when the coverage
arrives indirectly.

The requester-facing half lands with B2, because there is no request-detail surface until the
card is rebuilt.

Both previews were checked against the running app. A reviewer issuing `DATASET:LIST_FILES` to
a member of `Dr. Alice Wong Lab` on `PCM230203` now reads "Dr. Alice Wong Lab already holds
this with no end date" beside the new grant, and an approval already covered by a longer grant
reads "Already covered by a grant expiring Dec 31 2034 — nothing will be written". The
requester's panel names a grant held through a system principal the same way.

The requester's panel also had two defects of its own. It never loaded, because it watched the
subject without an initial read and the dialog opens with the subject already set. And it
formatted `approved_until`, a field a grant row does not carry, so every grant read "Never
expires".

### C4 — Effective access sits beside the decision

An `APPROVED` request whose grants were all revoked reads as access the requester does not
have. This is risk 1 in [Trust and communication](./trust-and-communication.md) and the
highest-risk case in the design.

The request detail and the three list endpoints carry a summary derived from the live grants,
so no client infers it. C1's query answers this too.

Grants written before this work carry no `source_access_request_id`, so the summary is empty
for seeded rows and correct for everything issued from now on.

The summary is derived, not stored. For one request it counts the grants naming it as their
source, split into live, revoked, and expired, and it names the most recent revocation and
why. The three states are exclusive and exhaustive, so they sum to the number issued.

The three listings get the counts from one grouped query for the whole page, so a listing
costs one round trip rather than one per row. The detail surface additionally runs C1's
coverage query, which answers the other half: an approved item writes no grant when a broader
one already covers it, so a request can read as APPROVED with nothing issued while the subject
still holds the access. That costs a query per request, which is why the listings do not ask
it.

Which access types the coverage query asks about depends on the status. A decided request
asks about its approved items, because those are what it claims to have produced. An
undecided one asks about every item, because no item is approved yet and "does the subject
already hold this?" is the reviewer's first question. `coverageAccessTypeIds` makes that
choice, and `UNDECIDED_STATUSES` is `DRAFT` and `UNDER_REVIEW`.

The card says "No live access from this request" when a decided request has issued grants and
none survives. It stays silent while a request is under review and when the request issued
nothing, because the detail page is where the coverage query can explain the second case.

*Files:* `services/access_requests/access_summary.js` (new),
`services/access_requests/fetch.js`, B3's page, B2's card.

Checked against the running app. An approved `DATASET:DOWNLOAD` read "1 live"; revoking that
grant left the request `APPROVED` and the page then read "0 live · 1 revoked — Nothing from
this request is in force any more. The last grant was revoked 4s ago (manual).".

Checked again after the detail page was rebuilt. A request asking for `DATASET:DOWNLOAD` and
`DATASET:COMPUTE` was approved on the first and rejected on the second; the page then read
`PARTIALLY APPROVED`, "1 live · 0 revoked · 0 expired", and one `APPROVED` and one `REJECTED`
item badge. A seeded request whose two approved items were both already covered read "0 live"
with "This request issued no grants. Anything approved was already covered by access the
subject holds." beside two coverage rows.

### C5 — Every grant row names where it came from

`grant` already carries `source_access_request_id` and `source_preset_id`. Neither reaches the
Access tab, so a request for "Standard Research Use" decays into a flat list of access types.

`listGrantsForResourceGrouped` and `listGrantsForSubjectGrouped` carry both, plus the preset
name, and the tab renders a "via" label. This is risk 5, which
[Trust and communication](./trust-and-communication.md) calls a launch requirement rather than
an enhancement.

The plan said the server change was a left join for the preset name. It was not, because
`source_preset_id` was null on exactly the grants that needed it. `GrantIssueService` refused
`access_request_id` and `source_preset_id` together, so a grant expanded from an approved
preset item recorded the request and forgot the preset.

That constraint is wrong rather than inconvenient: such a grant has both provenances. It is
removed, and the service now builds an `access_type_id → preset_id` map alongside the expiry
map it already builds, so each grant records the preset that supplied it. An access type a
request named directly did not come from a preset and maps to null, whatever else the request
contained; an access type two presets both supply has no single answer and maps to null too,
because a label naming one of two presets is worse than none.

Grants issued before this carry no preset and show only the request, which is honest.

Both grouped queries emit `source_preset` and `source_access_request` as nested objects,
because `GrantRow` and `GrantProvenanceBox` already read that shape. The request link now
goes to B3's page; before it went nowhere, so it reads "View request" rather than printing a
UUID.

*Files:* `services/grants/issue.js`, `services/grants/fetch.js`, `GrantProvenanceBox.vue`,
`DatasetGrantsTab.vue`, `CollectionGrantsTab.vue`.

Checked against the running app. An approved "Standard Research Use (Dataset)" request now
shows each of its three grants badged with the preset name and captioned "Issued as part of
'Standard Research Use (Dataset)'", and the request link opens the request, which reads
"3 LIVE". A revoked grant from an earlier single-access-type request sits beside them with no
preset badge.

## Phase D — Close the notification loop

### D1 — Submission and decision are notified, in app

Use case 9 puts this in the first release, because people do not poll a portal and an
un-notified approval reads as a rejection.

`submitRequest` notifies the reviewers, who are the admins of the resource's owning group.
`submitReview` notifies the requester. Both write through `InAppNotificationService.create`
directly.

The bus is deliberately not used. `EVENTS.REQUEST_RECEIVED` and `EVENTS.REQUEST_COMPLETED`
have handlers registered and nothing emits them, so emitting looked like the obvious wiring.
But `NotificationService._enqueue` always queues an email job and throws when it has no
recipients; in-app is a dual-write that happens only when a `userId` comes along too. There is
no in-app-only path, and adding one changes shared infrastructure that the notifications epic
owns. So those two events keep having no emitter, and this epic writes the in-app row itself.

Reviewers are found by joining the resource to its owning group and that group to
`active_group_user` on `role = 'ADMIN'`, which is the same set
`getRequestsPendingReviewForUser` selects from the other direction. The requester is notified
rather than the subject: a group's admin who asked on the group's behalf is the person who
needs the answer, and a group has no inbox.

Both notifications run after their transaction has committed and neither can fail it. An
un-notified approval reads as a rejection, but a notification that cannot be delivered must
not undo the decision, so failures are logged and swallowed.

The SSE manager opens two Redis connections when it is constructed and never closed them,
which is right for a server process and wrong for anything short-lived: any test that creates
a notification pulled the module in and then never exited. It has a `shutdown()` now, and the
suites that reach the notification path call it.

The collection tab also gained the header Request Access button the dataset tab already had.
Without it the only way into the dialog was the empty state, so a second request could not be
filed from that tab at all.

*Files:* `services/access_requests/notify.js` (new), `services/access_requests/request.js`,
`services/access_requests/review.js`, `notification/inApp/sseManager.js`,
`CollectionRequestsTab.vue`.

Checked against the running app. Filing a collection request put "Access request for
Collection 01 · Alice Johnson · Review request" in the owning group admin's notifications, and
rejecting it put "Your access request for Collection 01 was rejected · Compute is not enabled
on this cohort yet. · View decision" in the requester's.

### D2 — Stale requests expire on a schedule

`expireStaleRequests` was implemented, tested, and called by nothing, so a request sat
`UNDER_REVIEW` forever and the pending queue only ever grew. `src/notification/cron.js` is
the API's only scheduler that fires once regardless of cluster size, and it documents how to
add a job.

The schedule and the cutoff are configuration rather than constants, under
`notify.cron.access_request_expiry`: 02:00 daily, and thirty days. Neither is derivable, so
both are stated as choices someone may change. Thirty days is the point at which a request
nobody has looked at is better closed than left implying it is still live; the hour is
overnight, when nobody is mid-review.

The template's `Europe/London` also went. It is now `notify.cron.timezone`, set to the
institution's own, and every job registered here reads it — a test asserts that, so a job
added later cannot quietly keep the template's.

*Files:* `notification/cron.js`, `config/default.json`.

## Two things settled here

### Supersession and the no-overlap constraint stay

The `grant_no_overlap` exclusion constraint and the supersession machinery were questioned in
the 2026-09-03 design review as finding 5, deferred at the time, and re-examined on 2026-09-09.
They stay. [Decisions](./decisions.md) carries the reasoning.

The argument that carried most weight against them turned out to be a defect in two preview
components rather than a property of the model, and C2 fixes it.

### The concurrency race is a documented edge case

Two reviewers approving two requests for the same subject, resource, and access type in the
same moment collide on the exclusion constraint. One approval is rejected, and which expiry
survives depends on which transaction commits first. `issueGrants.concurrency.test.js` asserts
exactly this shape: one of the two may be rejected, and the surviving grant may carry either
expiry.

Nothing retries. The losing reviewer sees a 409 and must review again, which succeeds, because
the winning grant is then visible to `fetchExistingGrants` and the second approval becomes a
case-2 skip or a case-3 supersession.

This is accepted rather than fixed. Two admins reviewing requests for the same subject and the
same dataset within the same transaction window is rare, the failure is loud rather than
silent, and the recovery is to review again. If it is ever observed, the fix is to retry the
losing transaction, not to remove the constraint.

## Testing

Each new service function gets lifecycle and invariant tests beside the existing
`tests/services/access-requests/` and `tests/services/grants/`.

A test that creates a dataset or a collection through a v2 service must delete its grants
before deleting the resource, because `grant.resource` is `ON DELETE RESTRICT`.

The seed carries seven access requests and none is `UNDER_REVIEW`, so the pending queue is
empty until one is created through the flow. All 63 seeded grants have a null
`source_access_request_id`, so provenance labels and effective-access summaries are blank on
seeded data by design.

## Status

Every phase is built: A1, B1 to B6, C1 to C5, D1, and D2. The loop was driven end to end in
the browser on both resource types — a researcher files a request, an admin reviews it and
sees what the approval confers, the decision reaches the requester in app, and both sides can
tell afterwards what access exists.

What the epic deliberately left out is unchanged and listed under [Out, and why](#out-and-why):
the oversight review queue, a pre-submit validation endpoint, intra-preset partial approval,
empty states that distinguish "no access" from "no results", and renewals.

The order to build in is A1, then B1 to B6, then C4 and C5, then D1 and D2. A1 comes first
because the request tabs must not reach a non-admin before it lands. C4 needs B3's page to
have somewhere to render, and D1 needs B3's page to have somewhere to link to.

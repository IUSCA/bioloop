---
title: Restrictions and resource state plan
order: 9
status: active
implemented: none
last_verified: 2026-09-15
---

# Restrictions and resource state plan

The ordered work to separate resource state from authorization, and to leave a restriction check
on every action that allows everything until restrictions are specified.

Nothing in this plan adds a feature to MVP scope.

The decisions are recorded in [Decisions](../decisions.md): decision 6 for restrictions, and
[decision 17](../decisions.md#_17-resource-state-is-checked-after-authorization) for resource
state. [Access model](../access-model.md) states the rule, and [Design](../design.md) describes
archiving and restrictions.

## What changes

- **Resource state leaves the authorization layer.** An archived group or collection, a
  deleted dataset, and the status of an access request, an invitation, or a grant are
  checked by the service that performs an action, after authorization, and refused with 409.
- **Archiving covers the group or collection itself and what it owns.** A sub-group keeps its own
  state until someone archives it.
- **Every action passes a restriction check.** The check runs at every level that decides
  access, and it allows every action. How a restriction is specified and implemented is deferred.
- **The UI reads resource state for flags.** `is_archived` and `is_deleted` drive badges and
  labels, as they do today.

## Decisions

### D1. Resource state is checked after authorization

Authorization answers what a caller could do on a resource. The service that performs the action
answers whether the resource's state admits it.

A **state check** refuses an action the resource's state does not admit. The service that
performs the action fetches the resource inside its transaction, after taking the row lock, and
asks whether the action is possible. A refusal is a 409, and a platform admin is refused the same
way.

Which actions a state admits is business logic, and it belongs to the resource. The state layer is
therefore split the way authorization is. `state/core/` is framework code that knows nothing about
this application, `state/builtin/` holds one file per resource type, and `state/custom/` is the
extension point a derived app fills.

- **A resource's file declares one rule per action.** A rule is a pure function of the resource
  and returns a refusal or nothing. An action no state limits declares `always`.
- **A rule declares the fields it reads.** The caller fetches them and passes the row in, so the
  layer runs no query and takes no transaction. A list fetches the fields once for the page and
  runs the rules over its rows. A field a rule needs and the caller did not fetch is a programming
  error naming the field.
- **A startup check keeps the two layers in step.** Every action a policy container declares has a
  rule, no rule names an action no container declares, and every container has a state file.

An archived group refuses its own mutating actions, an archived collection and an archived owning
group refuse a collection's, and a deleted dataset refuses both mutation and every read of its
bytes. Each of those sentences is one resource's rule rather than a row in a shared table, so a
resource whose business differs says so in its own file. Deleting a dataset sets `is_deleted` and
removes its archived files, and it cannot be undone.

The transition rows move out of the policy containers into the state files. A request's status is
resource state by the same definition as `is_archived`. Decided 2026-09-15, and the per-resource
shape on 2026-09-16.

### D2. Archiving covers the group itself

An archived group forbids the actions above on itself, and on the datasets and collections it
owns. A dataset or collection reads its owning group's `is_archived`, one step up. No check walks
the group tree, and a sub-group stays active until someone archives it.

### D3. Every action passes the restriction check, which allows everything

The restriction check stays in the engine, before the platform-admin check. It runs for every
registered action at every level that decides access:

- a single decision, in `createDecisionPipeline`;
- the capability map;
- the per-row decisions of a list, in `decideRows`;
- the SQL a list reads, through a restriction predicate that `accessibleIdsQuery` and each list
  builder add, and that is `TRUE` today. `accessPathsQuery` itself stays free of restrictions, as
  its header comment requires.

A container a derived app registers in `custom/` passes it too. The check returns "not blocked"
for every action until restriction types are specified.

### D4. The restriction tables leave until restrictions are specified

`restriction`, `restriction_type`, and the `effective_restriction` view are removed with the
`ARCHIVED` and `DELETED` types. A table nothing writes reads as shipped. The specification that
decision 6 defers brings back whatever storage it needs.

Accepted 2026-09-15.

## The two answers in the response

Decided 2026-09-15. A detail route and a list row carry both answers:

- `_meta.capabilities` holds what the caller could do.
- `_meta.available_actions` holds what the resource's state admits.

A page shows a control when its action is in `_meta.capabilities`, and enables it when the action
is also in `_meta.available_actions`. The rule is two lookups, so the page computes no decision.

A control whose state cannot return is hidden instead of disabled. A decided request never goes
back under review, and a revoked grant is never active again, so a disabled Review or Revoke there
says nothing. A control blocked by a state that can return, such as an archived group, shows
disabled. Which of the two a control uses is fixed per control, so it is not a decision.

Sending both keeps authority visible. An admin of an archived group still sees the member and
archive controls, disabled, and `is_archived` says why. A merged list would hide them, and the
admin could not tell "not allowed" from "archived". The cost is a second list on every detail
route and list row.

## Every current consumer, and where it goes

| Consumer | Today | After |
|---|---|---|
| `checkRestriction`, step 1 of `createDecisionPipeline` | `ARCHIVED` and `DELETED` by target | the restriction check, which blocks nothing |
| `filterRestrictedCapabilities` | restriction types by target | the restriction check; state leaves the capability map |
| `applyTransitions` in the capability map | hides actions the transition table forbids | moves to the resource's state file |
| `decideRows` batch | `restrictionTypesByTarget` per page | the restriction check per page; each list fetches the fields its rules read and runs them over its rows |
| `accessibleIdsQuery` and the list builders | no restriction predicate | a restriction predicate that is `TRUE` |
| `isRestricted` guards, 11 sites in `groups.js`, `collections.js`, `profiles/index.js`, `invitations/index.js` | `effective_restriction`, following the group tree | the state check over the target's own column and its owning group's |
| Mutating services with no guard, such as promote, demote, and grant create and revoke | refused only by the engine | the state check, added |
| Access request status guards | a `WHERE status = ...` guard on each write | the guard stays, because it makes the write atomic; the state check names the state first |
| A create under a sub-group of an archived group | refused | allowed; only the owning group's own column is read |
| Invitation validity | invalid while restricted | invalid while the group is archived |
| Access request review on an archived or deleted resource | refused by the engine | the state check in the review service |
| `mayRequestAccess` | `checkRestriction` on `access_request.create` | the restriction check, and the resource's state |
| `restrictionTargetFor` | maps six containers to a group or a resource | removed; the restriction check needs no target while it blocks nothing |
| `RESTRICTION_TYPES`, `typeBlocks`, `blockedActions`, `effectiveRestrictionTypes` | the two types | removed; each resource's state file answers what its states forbid |
| `restriction`, `restriction_type`, `effective_restriction` | the two types' rows and view | removed by D4 |
| `GET /v2/restrictions/:type/blocked-actions` and the two archive dialogs | `ARCHIVED` blocked actions | `GET /v2/states/:resource_type/archived/forbidden-actions`, from that resource's rules |
| `restrictionLabels.js` and its test | labels for `ARCHIVED` | labels for the archived state |
| `restriction class` on every action | read by the restriction types | read by the state table; kept for restrictions once they are specified |
| The refusal `Blocked by a ARCHIVED restriction` | 403 from the middleware | 409 from the service |
| The "archived column agrees with the restriction row" test | asserts a cache | removed; the column is the authority |
| `currentStateScan.test.js` | flags `is_archived: false` | archive reads go through the state check |
| `reference.js` `restricted` and `deletedBlocks` | one function over types | the state containers per resource; `restricted` is always false |
| `worlds.js` restriction dimension | none, dataset, collection, owning group, parent group | an archive dimension over the resource and its owning group |
| `engineArm`, `operationSequences`, `serviceGuards`, `restrictions`, `restrictionTargets` tests | restriction types | state checks, and a test checker that blocks one action |
| `e2e/src/specs/restrictions/archive.spec.js` | 403 on a blocked action; A4 asserts descendants frozen | 409; A4 asserts a sub-group stays active |
| `docs/contributing/request-lifecycle.md`, `code-map.md`, the seeding guide, and the skills | the as-built restriction layer | updated in the phase that changes the code |

## Implementation

The code was read on 2026-09-15 to plan this work. Four findings shape the order.

- **Most services check no state.** Eleven sites call `isRestricted`, and access requests and
  grants check their own status. Every other service that performs a `mutating` or `data` action
  relies on the engine alone. That includes promote, demote, group and collection create and
  archive, every dataset write, file listing, download, staging, grant issue, and grant revoke.
- **While the engine still refuses, a route cannot show the service's answer.** An archived
  target gets 403 from the middleware before the service runs. Phase 2 therefore tests services
  directly, and Phase 3 adds the route-level test once the engine stops reading state.
- **Every capability gate in the UI hides its control, and no page shares the reading.** Each
  detail page builds its own `can()`. The archive toggle picks its label and its API call from
  `is_archived`, which only works because the capability map hides the action the state forbids
  today.
- **Several defects sit on the same paths, and this work fixes them where it touches them:**
  - revoking an already revoked grant answers 404, not 409;
  - `archiveGroup`, `unarchiveGroup`, `archiveCollection`, and `unarchiveCollection` take no row
    lock and check no state;
  - `addDatasets` answers 400 for an archived group before its transaction and 409 inside it;
  - the group avatar routes write through `prisma` inline, with no service;
  - `POST /collections/:id/stage` is gated only by `collection.view_metadata`;
  - `GET /grants/:id/revoke-preview` binds the mutating `grant.revoke`, so today an archived
    resource refuses the preview;
  - the dataset delete operation is named `archive`: `dataset.archive` in the policy container and
    `POST /v2/datasets/:id/archive` in the route. A `dataset.unarchive` action exists that nothing
    binds, and delete does not refuse a dataset already deleted.

`PUT /access-requests/:id` passing its arguments in the wrong order is the same path, and is
filed as L2 T20. Phase 2 fixes it with the state check on `updateAccessRequest`.

Each phase ends with its tests green, a browser check where a page changed, the skills updated,
and a commit.

### Phase 1: the state layer

No behaviour changes in this phase. Nothing calls the layer until Phase 2.

**`api/src/state/core/`, the framework.**

- **`StateContainer`.** One per resource type. `rules({...})` takes a rule for each action and
  freezes. `getRule`, `getActionNames`, and `requiredFields` read them back.
- **`rules.js`.** `rule({ requires, check })`, `always`, and `refuse(message)`. `requires` lists
  field paths on the object the caller passes, such as `owner_group.is_archived`.
- **`StateRegistry`.** `register`, `get`, and `listTypes`, as the policy registry has.
- **`engine.js`.** `check(resourceType, action, resource)` returns a refusal or null.
  `assertPossible(...)` throws 409. `availableActions(resourceType, resource)` lists what the state
  admits. `requiredFields(resourceType)` gives a caller the union to fetch. All of them are pure,
  and a missing field throws an error naming the path.
- **`findStateGaps(policyRegistry, stateRegistry)`.** The three lists the startup check throws on:
  a container with no state file, an action with no rule, and a rule naming no action.

**`api/src/state/builtin/`, one file per resource.** Each file starts with the behaviour the
restriction types have today, so Phase 1 changes no decision.

- **`group.js`.** An archived group refuses its mutating actions. `archive` refuses an archived
  group, and `unarchive` an active one. Reading is always possible.
- **`collection.js`.** An archived collection, or one whose owning group is archived, refuses its
  mutating actions. `delete` refuses a collection with history. `create` reads the owning group.
- **`dataset.js`.** A deleted dataset refuses its mutating actions and every read of its bytes. An
  archived owning group refuses the mutating actions and leaves the bytes readable.
- **`access_request.js`.** `update`, `submit`, and `withdraw` read the status. `review` needs
  `UNDER_REVIEW` and refuses an archived or deleted target. `create` reads the target.
- **`grant.js`.** `revoke` refuses a revoked grant, and an archived or deleted target. `create`
  reads the target.
- **`invitation.js`.** `accept` and `cancel` need a `PENDING` invitation and an unarchived group.
  The container is `standalone`, because invitations have no policy container, and the startup
  check allows a standalone container to name actions no container declares.
- **`user.js` and `audit.js`.** Every action is `always`.
- **`targets.js`.** `readTargetState(client, resourceId)` reads whether the dataset or collection a
  grant or a request names is archived or deleted. A caller uses it to build the fields those rules
  read, so the query is written once rather than in each service.

**`api/src/state/index.js`** builds the registry, runs `findStateGaps` against the policy registry,
and throws when a list is not empty. The API refuses to start on a mismatch.

**Tests.**

- `api/tests/state/rules.test.js` drives every rule as a pure function, with no database: each
  state of a resource against each of its actions.
- `api/tests/state/sync.test.js` asserts the three gap lists are empty for the shipped registries,
  and that a policy container with no state file, a rule naming no action, and a caller that omits
  a required field each fail.

**Exit:** the tests pass, and no decision changes.

### Phase 2: every service checks state

Each service below fetches the fields its resource's rules read, inside its transaction and after
its row lock, and calls `assertPossible`. A service with no transaction or lock gains both.

- **`services/groups.js`.**
  - `updateGroupMetadata`, `addGroupMembers`, and `removeGroupMembers` switch from `isRestricted`.
  - `promoteGroupMemberToAdmin` and `demoteAdminToMember` gain the check. Promote gains the row lock.
  - `createGroup` checks the parent for `create_child`.
  - `archiveGroup` and `unarchiveGroup` lock the row and refuse the wrong state with 409.
  - The avatar routes move into a service with the check.
- **`services/collections.js`.**
  - `updateCollectionMetadata`, `addDatasets`, and `removeDatasets` switch. The 400 that
    `addDatasets` returns before its transaction becomes the 409.
  - `createCollection` checks the owning group.
  - `deleteCollection` checks archived state beside its history rule.
  - `archiveCollection` and `unarchiveCollection` lock and check, as for groups.
- **`services/invitations/index.js`.** `createInvitation`, `applyPendingInvitations`,
  `checkInvitationToken`, and `acceptInvitationByToken` switch to the group's state.
  `cancelInvitation` gains the check.
- **`services/profiles/index.js`.** `updateProfile` switches.
- **`services/datasets_v2/`.**
  - `createDataset`, `bulkCreateDatasets`, `importDataset`, and `registerUpload` check the
    owning group inside their transaction. `ownership.js` keeps its `is_archived: false` filter,
    because it only chooses candidates.
  - `patchDataset`, `softDelete`, and `addFilesToDataset` check the dataset. `softDelete` refuses
    a dataset already deleted.
  - The delete operation takes its name. The action becomes `dataset.delete`, the route becomes
    `DELETE /v2/datasets/:id`, `dataset.unarchive` is removed, and `DatasetArchiveConfirmModal`
    becomes `DatasetDeleteConfirmModal`. Delete still sets `is_deleted` and removes the archived
    files.
  - `createWorkflow`, `bulkStage`, and the stage log in `routes/datasets_v2/workflows.js` check
    `request_stage` or `compute`.
  - `listFiles`, `getFileTree`, `searchFiles`, `getFileDownloadInfo`, and
    `getBundleDownloadInfo` check the `data` class.
- **`services/access_requests/`.**
  - `createAccessRequest` and `createAndSubmitAccessRequest` check the resource's state.
  - `updateAccessRequest`, `_submitRequest`, `withdrawRequest`, and `submitReview` add the
    resource's state. Their `WHERE status = ...` writes stay.
  - The route call to `updateAccessRequest` passes its arguments in order, closing L2 T20.
- **`services/grants/`.** `issueGrants`, `revokeGrant`, and `revokeAllGrants` check the
  resource's state. A revoke of a revoked grant answers 409.
- **`routes/collections.js` `POST /:id/stage`** checks each dataset's state.

The v1 `POST /datasets/uploads/:id/complete` route and the TUS `onUploadCreate` hook check no v2
state. Both are v1 code, so they are recorded in [v2 cut-over](../../v2-cutover.md) and not changed.

**Tests:**

- `api/tests/state/serviceStateChecks.test.js` maps each `mutating` and `data` action to
  the service call that performs it. It calls each against an archived target, against a target
  whose owning group is archived, and, for `data`, against a deleted dataset. Each answers 409.
  Removing one check by hand makes it fail.
- A sub-group of an archived group accepts a membership change.
- The concurrency suites gain archive-then-add under the lock, and unarchive under the lock.
- `serviceGuards.test.js` becomes the direct 409 cases. The lifecycle, invariants, and invitation
  tests move from 400 or `isRestricted` to 409.

**Exit:** the new tests pass, the full API suite passes, and the engine still refuses first.

**As built, 2026-09-15.** Every service listed above asks the state layer, and three of them
departed from the description here.

`bulkStage` checks the row its caller passes rather than fetching state itself. A first version
queried the page's state fields inside the service, which made a pure decision depend on the
database, broke a unit test that fabricates dataset rows, and had no sensible answer for a row
the query did not return. The collection stage route widened its own query instead, with
`includes: { owner_group: true }`, and `bulkStage` documents the fields a caller supplies.

`addDatasets` now runs the state check before its validation query rather than after, and the
query lost its `g.is_archived = false` predicate. The join already ties the dataset's owning
group to the collection's, so that predicate restated exactly what the state rule reads. An
archived collection or owning group answers 409, and only an unknown, deleted, or foreign
dataset answers 400. This closes the split answer the findings above record.

`revokeAllGrants` passes a grant row it fetched to the check. Building `{ revoked_at: null }`
inline restated the filter of the query above it, which `currentStateScan` reports as a service
restating a current-state view.

The dataset rename landed whole: `dataset.delete` in the policy container and the state file,
`DELETE /v2/datasets/:id` in the route, no `dataset.unarchive` anywhere, and
`DatasetDeleteConfirmModal` in the UI. `npm run model:table` regenerated
[the decision table](../generated/access-decisions.md), whose only change is that rename.

The model suite carried the pre-D2 premise in nine places, which was the bulk of the work.
Seven command expectations in `operationSequences.test.js` moved from `groupRestricted`, which
walks ancestors, to the group's own archived column, and `resourceRestricted` split in two:
`resourceStateRefuses` reads one step, for the commands that drive services, and the
ancestor-walking predicate is left for the engine's `checkRestriction` expectation, which
`effective_restriction` still answers until Phase 3 removes it.

Verified: 108 suites and 1178 tests pass. The concurrency case is not a forced tie — over 40
iterations the membership change committed 14 times and was refused 26 times, with no iteration
producing a refusal beside a member or a success without one. `tests/services/grants/coverage.test.js`
failed once in a 20-suite subset on an ancestor-inheritance assertion and has not reproduced
since, in that same subset or in the full suite; it builds its own fixtures and nothing in this
phase touches its path, so it is recorded here as an order-dependent flake rather than as fixed.

Two findings above are untouched and move to Phase 3: `GET /grants/:id/revoke-preview` still
binds the mutating `grant.revoke`, and `POST /collections/:id/stage` is still gated by
`collection.view_metadata` with each dataset's own state checked inside `bulkStage`.

### Phase 3: the engine stops reading state

- **`authorization/builtin/restrictions.js`** becomes one checker that returns `null` for every
  action. `RESTRICTION_TYPES`, `typeBlocks`, `blockedActions`, `effectiveRestrictionTypes`,
  `restrictionTypesByTarget`, `blockingRestriction`, `restrictionTargetFor`, and
  `RestrictionTargetError` are removed.
- **`authorization/core/pipeline.js`** keeps the restriction step and `refuse`, with `blockedBy`
  for types specified later. The platform-admin branch stops calling `applyTransitions`.
- **`authorization/core/capabilities.js`.** `evaluateCapabilitySet` stops calling
  `applyTransitions`, which is removed with the transition rows. The state files carry them.
- **`authorization/index.js`.**
  - `decideEachRow` calls the restriction checker for the page. Each list route fetches the fields
    its rules read and runs `availableActions` over its rows for the second answer.
  - `mayRequestAccess` reads the restriction checker and the resource's state.
- **List SQL.** `accessibleIdsQuery` gains a `restrictionPredicate` argument that defaults to
  `TRUE`. The list builders pass it:
  - `createAccessibleDatasetIdsCte` in `services/datasets_v2/fetch.js`;
  - `buildAccessibleCollectionIdsCte` in `services/collections.js`;
  - `searchGroupsForUser` in `services/groups.js`;
  - `listExpiringGrantsForAdmin` in `services/grants/fetch.js`;
  - `getRequestsPendingReviewForUser` in `services/access_requests/fetch.js`.
- **Detail routes and list rows** carry `_meta.available_actions`:
  - `GET /v2/datasets/:id`;
  - `GET /collections/:id`;
  - `GET /groups/:id` and `/groups/slug/:slug`;
  - `GET /access-requests/:id`;
  - every `decideRows` and `projectRows` caller.
- **`routes/restrictions.js`** becomes `routes/states.js`, which serves
  `GET /v2/states/:resource_type/archived/forbidden-actions` by running that resource's rules
  against its own row with `is_archived` set.
- **`services/restrictions.js`.** `isRestricted`, `applyRestriction`, `liftRestriction`, and
  `restrictionHistory` are removed. The archive services stop writing restriction rows.

**Tests:**

- `api/tests/routes/stateRefusals.test.js` walks the router stacks for every route bound to a
  `mutating` action. It sends each to an archived target and gets 409.
- A test-only checker that blocks one action refuses it in a single decision, and removes it from
  the capability map. It also removes it from a list row, and removes the row from a list whose
  SQL applies the predicate.
- `api/tests/model/reference.js`:
  - `restricted` is always false;
  - `stateAdmits` reads the state containers, so the model and the code share one statement of
    what each state admits;
  - `decide` no longer returns `ARCHIVED` or `DELETED`.
- `worlds.js` replaces its restriction dimension with `archived`, with the values none, the
  resource, and the owning group.
- `modelCoverage.test.js` checks the state rules, not the restriction types.
- `engineArm.js` and `decisionTable.js` replace `blockedBy` with the state column, and
  `npm run model:table` regenerates the decision table.
- `operationSequences.test.js`:
  - asserts a sub-group stays mutable;
  - verifies with `check` from the state layer;
  - drops the archived-column invariant.
- `restrictions.test.js` becomes cases under `tests/state/`. `restrictionTargets.test.js` is removed.
- `platformAdminShortCircuit.test.js` asserts 409 for a platform admin on an archived target.
- `restrictionLabels.test.js` reads the state route.
- `groups.invitations.test.js` moves from 403 to 409.

**Exit:** every test above passes, the Engine, List rows, Standing, and Transitions arms agree
with the reference model, and the full API suite passes.

**As built, 2026-09-15.** The engine stops reading state, and five things departed from the
description above.

`accessibleIdsQuery` gained the `restrictionPredicate` argument, defaulting to `TRUE`, but no
call site passes it. Two of the five builders named above — `searchGroupsForUser` and
`getRequestsPendingReviewForUser` — call `accessPathsQuery` directly and cannot take it at all.
Threading a constant `TRUE` through the other four would add a parameter nobody reads, so the
seam sits on the query and the call sites are left until a restriction type exists to put in it.

That departure was not free, and the full suite is what found the cost.
`GET /v2/datasets/eligible-owner-groups` offered archived groups as dataset owners. Its
candidates query deliberately did not filter them, and its docstring said why: every candidate
is decided by `dataset.contribute`, so "an archived group, a closed group, and a group the rule
does not admit drop out there, by the rule itself rather than by a copy of it here". That
rationale depended on the engine reading archive state, which this phase removed, so the list
stopped excluding them while `getOwnerGroupForAuthorization` still refused the same group when a
create arrived. `listOwnerGroupCandidates` now excludes archived groups in both branches, and
its docstring says the exclusion is the group's own state rather than something the engine
answers. The lesson is the one the repository's cleanup rule states: a stated rationale is a
claim to recheck when its premise is reversed, and this one read as correct while being false.

One more consequence of the same kind. `collection.delete` was withheld from the capability map
through the restriction checker, which read the `has_history` virtual attribute; with the checker
allowing everything, a collection with history was offered `delete`. The refusal has not moved
anywhere unexpected — the service still answers 409 from the same `has_history` under its lock —
but the answer a page reads moved from `capabilities` to `available_actions`.
`tests/services/collections/deleteRefusal.test.js` now asserts both halves: the admin keeps the
capability, because having history is not a loss of authority, and the collection's state
withholds the action. Phase 5 must read `available_actions` for this button, not capabilities.

The collection hydrator's `has_history` virtual attribute is now unread by any policy. It is left
in place because `readCollectionStateFields` computes the same two counts for the state layer and
Phase 5 may want the hydrated form; if it does not, it is dead weight to remove there.

`_meta.available_actions` reaches the five detail routes and two list routes, not every
`decideRows` and `projectRows` caller. `projectRows` takes an `availableActionsOf` option, so
the remaining nine call sites are one line each — but a state rule throws rather than decide
from a field the caller did not fetch, and most list queries do not fetch those fields. The
dataset search gates its answer on `include_owner_group` for exactly that reason. Adding a
per-row query to a list to answer a UI convenience is a performance decision rather than a
mechanical edit, so the rest wait for Phase 5, which will say which lists the UI actually reads
it from.

Each state container declares its named states as `examples`, and the engine gained
`forbiddenActions(resourceType, stateName)`, which runs the resource's own rules against its own
example. `GET /v2/states/:resource_type/:state_name/forbidden-actions` serves it, so the archive
dialogs and the 409 a service returns come from one statement. The collection's archived example
sets its own column **and** its owning group's: the two refuse the same actions, and naming both
is what makes a group's archive dialog and a collection's agree. The dialogs now ask per resource
type, because what a state forbids is the resource's answer, and the UI service was renamed to
`states.js` with it.

Two tests exist that the plan did not name, and both answer gaps the plan's own list would have
left. `tests/authorization/restrictionSeam.test.js` injects a checker that blocks one action and
asserts the decision, the capability map, and a list row, then asserts the builtin checker blocks
none of the registered actions — without it the no-op seam had no coverage at all and could break
unnoticed. `tests/routes/mutatingRouteSweep.test.js` walks the router stacks through
`middleware.authorizes` and checks every route bound to a `mutating` action against its
resource's archived example, with five exemptions each carrying its reason: `unarchive` on a group
and a collection, `group.create` for a root group, and `access_request.update` and `withdraw`,
which a requester may still take on their own draft. The sweep found those three admitted
mutations, and each is correct rather than a hole.

`restrictions.test.js` was reduced rather than transplanted. `tests/state/rules.test.js` already
drives every rule as a pure function and `serviceStateChecks.test.js` already covers each 409, so
what moved to `tests/state/archivedState.test.js` is only what needs a database: that archiving
writes the column, that it refuses changes to the datasets the group owns while leaving their
bytes readable, and that a sub-group and the datasets **it** owns stay mutable. That last case
inverts what the old test asserted, and reading it off the rules would be circular, which is why
it keeps a real group tree.

Three consequences of the removal were found by sweeping rather than by the plan. The
`access_request` policy and the access-requests route both carried comments crediting
`restrictionTargetFor` with stopping a request on an archived dataset; the request's own state
rule does that now. `refusalMessage` still formats a `blockedBy` no builtin checker sets, which
is correct for an injected one and now says so. And the UI's label table named three actions the
archived state admits — `group.create`, `access_request.update`, and `access_request.withdraw` —
which `stateLabels.test.js` caught from the other direction.

`getRestrictionClass` is now a misnomer: the layer it was named for is gone, but the three
classes are load-bearing in `core/capabilities.js`, in two model arms, and in the reference
model's `stateAdmits`. Renaming it to an action-kind accessor is filed in `.todo` rather than
folded in here.

Verified: 111 suites and 1187 tests, of which 1186 pass. The one failure is
`tests/services/grants/anonymousSubjectSet.test.js`, on "a grant to Public also reaches a
signed-in caller", and it is recorded as a flake rather than as fixed because that is what the
measurements support. It failed once in a full run and once when run alone, then passed 6/6
twice alone and passed when run by name with the other five skipped. Nothing in this phase
touches its path: `getGrantAccessTypesForUser` reads `accessPathsQuery`, and the only change to
that file is the `restrictionPredicate` argument on `accessibleIdsQuery`, a different function;
`git status` shows `services/grants/`, `constants.js`, and `builtin/standing.js` untouched. Its
own `afterEach` comment names the mechanism — two of its tests contend for the `grant_no_overlap`
exclusion constraint on the same collection and access type — so the likely cause is inside the
file rather than in the phase. It is the third suite this work has seen fail only intermittently,
with `tests/routes/health.test.js` and `tests/services/grants/coverage.test.js`, and the three
are listed together in the api-tests skill.

A second full run, taken straight after the first, settles it: 1186 of 1187 again, with the
single failure a **different** suite, `tests/services/grants/coverage.test.js`. Two consecutive
runs failing one test each, on two different suites that both pass alone, is order dependence
between suites rather than anything this phase changed.

### Phase 4: storage

- A migration drops `effective_restriction`, `active_restriction`, `restriction`, and
  `restriction_type`, as D4 decides.
- `schema.prisma` loses the `restriction` relations on `subject` and `group`. The comment on
  `group.is_archived` states the column is the authority.
- `prisma/seed_baseline.js` stops checking `restriction_type`.
- The `Unassigned Datasets` group keeps `is_archived = true`.
- `api/tests/model/dbWorld.js` stops writing restriction rows, and `e2e/src/world/teardown.js`
  stops relying on their cascade.

**Exit:** a database reset and seed succeed, and the full API suite passes. Prisma refuses
`migrate reset` when an agent runs it, so a person runs the reset.

**As built, 2026-09-15.** `20260916010000_drop_restriction_layer` drops the objects in
dependency order: the two views first, then `restriction`, then the `restriction_type` its
foreign key pointed at. The `DELETED` arm of `effective_restriction` read `dataset.is_deleted`
directly and needed no unwinding.

**No reset was needed, and none was run.** The exit criterion above assumed one, but this
migration only drops four objects nothing reads, so `prisma migrate deploy` applies it and
leaves every other row in place. It ran against the development database directly and against
`app_test` through `npm run test:db:setup`, which is the sanctioned path and uses
`migrate deploy` plus `db seed` itself. Both databases now report 51 migrations and
`Database schema is up to date!`, and neither holds any of the four objects. The standing
consent for a reset was therefore not used; a person can still run one, and nothing here
depends on it.

Nothing was preserved, because there was nothing to preserve. The development database held one
`restriction` row — the `ARCHIVED` backfill for `Unassigned Datasets` — and two
`restriction_type` rows, `ARCHIVED` and `DELETED`. The row duplicated the group's own
`is_archived` column, written in the same transaction, and `applied_by`, `lifted_by`, and
`reason` were never written by any service or exposed by any route. Who archived what and when
survives in `authorization_audit` and in `archived_at`. The archived group still reads correctly
from its column after the drop, which the migration check confirms.

Two prose sites the plan did not list needed the same sweep. The comment on `group.is_archived`
called the restriction table the authority and cited decision 6; it now says the column is the
authority, names the row lock, and cites decision 17. A comment on `dataset_funding` justified
its partial unique indexes by saying "The restriction table does the same", a comparison to a
table that no longer exists. `seed_baseline.js` lost both the `restriction_type` emptiness check
and the preflight docstring that said migrations insert the restriction types.

`api/tests/model/dbWorld.js` needed nothing: Phase 3 already moved it onto the archived columns.
`e2e/src/world/teardown.js` never deleted restriction rows, so its change is two comments that
listed `restriction` among the cascades.

The full API suite passes against the migrated `app_test`: 111 suites, 1187 tests, no failures.
This run was clean throughout, unlike the two Phase 3 runs that each lost one suite to
cross-suite interference.

### Phase 5: the UI

- **One capability helper.** `ui/src/composables/useCapabilities.js` replaces the `can()` each
  detail page defines, and the inline `.includes()` in `AccessRequestCard` and
  `CollectionDatasetsTab`. It exposes `can(action)` and `enabled(action)`.
- **The display rule.** Each control gated by a capability keeps its `v-if` and gains
  `:disabled` from `_meta.available_actions`, with the state flag as its reason. The controls that disable are:
  - the quick actions on the group and collection Overview tabs;
  - the Members, Subgroups, Datasets, Collections, and Invitations tabs;
  - the collection Datasets and Grants tabs;
  - the dataset Overview, Files, Grants, and Workflows tabs;
  - the access request page and card, and `GrantRow`.
- **The controls that hide** when their action is not in `_meta.available_actions`, because the
  state cannot return:
  - Review and Withdraw on the access request page and `AccessRequestCard`;
  - Revoke on `GrantRow`, and Remove all access on `GrantsBySubjectPanel`;
  - Withdraw on `GroupInvitationsTab`;
  - every `mutating` and `data` control on a deleted dataset, because deletion cannot be undone.
- **The archive toggle** shows whichever of `archive` and `unarchive` is in
  `_meta.available_actions`, not the one `is_archived` implies, and hands that action to the
  confirmation dialog.
- **Controls gated on raw state read the answer instead.**
  - `GrantRow`'s Revoke stops reading `is_active`.
  - `GroupInvitationsTab`'s Withdraw stops reading `'PENDING'`.
  - Workflow Resume and Stop keep reading the run's status, which is not access state.
- **The archive dialogs** read the state route. `restrictionLabels.js` becomes `stateLabels.js`.
- **Refusal messages.** These toasts drop the API message, and show it for a 409:
  - `DatasetDeleteConfirmModal` and `DatasetEditMetadataModal`;
  - `GroupInvitationsTab` and `AddGroupMemberModal`;
  - `DatasetWorkflowsTab` and `DatasetDownloadModalV2`.

  `UploadDatasetModal` and `ImportDatasetModal` stop describing a 403 as a location or group
  problem when it is a state refusal.
- **`api/tests/model/uiScan.test.js`** extends its rules to `is_active`, the invitation statuses,
  the archive ternaries, and `:is-archived`.

**Exit:**

- `uiScan.test.js` passes.
- A browser check covers four callers:
  - an admin of an archived group sees its controls under the display rule, and no unarchive;
  - a platform admin can unarchive;
  - the owner of a deleted dataset sees no download, edit, or delete control;
  - an admin of a sub-group of an archived group sees every control enabled;
  - a reviewer sees no Review on a decided request, and a grant manager sees no Revoke on a
    revoked grant.

### Phase 6: end to end, and the as-built documents

- **The archive e2e flows.**
  - `e2e/src/specs/restrictions/archive.spec.js` expects 409, through a new `expectConflict` in
    `e2e/src/assertions/parity.js`.
  - Flow A4 asserts a sub-group stays active.
  - Section K follows [E2E test flows](../e2e-test-flows.md).
- **The as-built documents.**
  - `request-lifecycle.md`, `code-map.md`, and the production seeding guide describe the state
    check and the restriction check as built.
  - So do the `authorization-engine`, `api-tests`, `e2e-tests`, and `v2-ui-changes` skills, and
    the v2 page patterns checklist.

**Exit:** the e2e suite passes except for the va-select spike filed in `.todo`. A sweep for
`ARCHIVED`, `DELETED`, `effective_restriction`, `isRestricted`, `blockedActions`, and
`restrictionTargetFor` finds only history.

## Out of scope

- **Specifying restrictions.** How a restriction is written, stored, satisfied, and lifted, and
  every restriction type, including data use agreements, training, exclusion, and freezes. Use
  cases 45, 46, and 47 stay `Later`.
- **Archiving a group's sub-groups in one action.**

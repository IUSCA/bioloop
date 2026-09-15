# Restrictions and resource state plan

The ordered work to separate resource state from authorization, and to leave a restriction check
on every action that allows everything until restrictions are specified.

Nothing in this plan adds a feature to MVP scope.

The decisions are recorded in [Decisions](./decisions.md): decision 6 for restrictions, and
[decision 17](./decisions.md#_17-resource-state-is-checked-after-authorization) for resource
state. [Access model](./access-model.md) states the rule, and [Design](./design.md) describes
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

A **state check** refuses an action the resource's state does not admit. Each service that
performs an action calls one helper inside its transaction, after taking the row lock, and throws
409. A platform admin is refused the same way.

The state check reads one **state table**. It lists, for each state, the restriction classes it
forbids and the actions it exempts:

- An archived group or collection forbids `mutating` actions, except `unarchive`.
- A deleted dataset forbids `mutating` and `data` actions. Deleting a dataset sets `is_deleted`
  and removes its archived files, and it cannot be undone.
- The transition table forbids an action outside the states its row lists.

The transition table moves here from the capability map. A request's status is resource state
by the same definition as `is_archived`. Decided 2026-09-15.

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
| `applyTransitions` in the capability map | hides actions the transition table forbids | moves to the state table |
| `decideRows` batch | `restrictionTypesByTarget` per page | the restriction check per page; state per page for the second answer |
| `accessibleIdsQuery` and the list builders | no restriction predicate | a restriction predicate that is `TRUE` |
| `isRestricted` guards, 11 sites in `groups.js`, `collections.js`, `profiles/index.js`, `invitations/index.js` | `effective_restriction`, following the group tree | the state check over the target's own column and its owning group's |
| Mutating services with no guard, such as promote, demote, and grant create and revoke | refused only by the engine | the state check, added |
| Access request status guards | a `WHERE status = ...` guard on each write | the guard stays, because it makes the write atomic; the state check names the state first |
| A create under a sub-group of an archived group | refused | allowed; only the owning group's own column is read |
| Invitation validity | invalid while restricted | invalid while the group is archived |
| Access request review on an archived or deleted resource | refused by the engine | the state check in the review service |
| `mayRequestAccess` | `checkRestriction` on `access_request.create` | the restriction check, and the resource's state |
| `restrictionTargetFor` | maps six containers to a group or a resource | removed; the restriction check needs no target while it blocks nothing |
| `RESTRICTION_TYPES`, `typeBlocks`, `blockedActions`, `effectiveRestrictionTypes` | the two types | removed; the state table answers what archiving forbids |
| `restriction`, `restriction_type`, `effective_restriction` | the two types' rows and view | removed by D4 |
| `GET /v2/restrictions/:type/blocked-actions` and the two archive dialogs | `ARCHIVED` blocked actions | a state route, such as `GET /v2/states/archived/forbidden-actions`, from the state table |
| `restrictionLabels.js` and its test | labels for `ARCHIVED` | labels for the archived state |
| `restriction class` on every action | read by the restriction types | read by the state table; kept for restrictions once they are specified |
| The refusal `Blocked by a ARCHIVED restriction` | 403 from the middleware | 409 from the service |
| The "archived column agrees with the restriction row" test | asserts a cache | removed; the column is the authority |
| `currentStateScan.test.js` | flags `is_archived: false` | archive reads go through the state check |
| `reference.js` `restricted` and `deletedBlocks` | one function over types | a state function; `restricted` is always false |
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

### Phase 1: the state table and the state check

No behaviour changes in this phase.

`api/src/services/state.js` holds three things:

- **`STATE_RULES`.** `archived` forbids the `mutating` class except `unarchive`. `deleted` forbids
  `mutating` and `data`.
- **`stateOf(client, { resourceType, id })`.** It reads the columns that decide the state:
  - a group's `is_archived`;
  - a collection's `is_archived`, and its owning group's;
  - a dataset's `is_deleted`, and its owning group's `is_archived`;
  - an access request's `status`, and the state of the resource it names;
  - a grant's `revoked_at`, and the state of the resource it names;
  - an invitation's `status`, and its group's `is_archived`.
- **`assertStateAdmits(tx, { resourceType, action, id })`.** It reads `stateOf`, applies
  `STATE_RULES` and the action's transition row, and throws 409 naming the state, such as "This
  group is archived." A create passes `owner_group_id` in place of `id`.

`statesByTarget(resourceType, ids)` reads the same columns for a page of rows, and
`admittedActions(resourceType, state)` lists the actions a state admits. Both read the policy
registry, so a container registered in `custom/` inherits the rules.

The transition rows stay beside their actions, declared with `mutating(policy, transition)`. The
capability map keeps reading them until Phase 3.

**Tests:** `api/tests/services/state/state.test.js` asserts, over the registry, that an archived
target admits no `mutating` action but `unarchive`, a deleted dataset admits no `data` action,
each transition row admits only its `from` states, and a throwaway `custom/` container inherits
the rules.

**Exit:** the tests pass, and no decision changes.

### Phase 2: every service checks state

Each service below calls `assertStateAdmits` inside its transaction, after its row lock. A service
with no transaction or lock gains both.

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
state. Both are v1 code, so they are recorded in [v2 cut-over](../v2-cutover.md) and not changed.

**Tests:**

- `api/tests/services/state/serviceStateChecks.test.js` maps each `mutating` and `data` action to
  the service call that performs it. It calls each against an archived target, against a target
  whose owning group is archived, and, for `data`, against a deleted dataset. Each answers 409.
  Removing one check by hand makes it fail.
- A sub-group of an archived group accepts a membership change.
- The concurrency suites gain archive-then-add under the lock, and unarchive under the lock.
- `serviceGuards.test.js` becomes the direct 409 cases. The lifecycle, invariants, and invitation
  tests move from 400 or `isRestricted` to 409.

**Exit:** the new tests pass, the full API suite passes, and the engine still refuses first.

### Phase 3: the engine stops reading state

- **`authorization/builtin/restrictions.js`** becomes one checker that returns `null` for every
  action. `RESTRICTION_TYPES`, `typeBlocks`, `blockedActions`, `effectiveRestrictionTypes`,
  `restrictionTypesByTarget`, `blockingRestriction`, `restrictionTargetFor`, and
  `RestrictionTargetError` are removed.
- **`authorization/core/pipeline.js`** keeps the restriction step and `refuse`, with `blockedBy`
  for types specified later. The platform-admin branch stops calling `applyTransitions`.
- **`authorization/core/capabilities.js`.** `evaluateCapabilitySet` stops calling
  `applyTransitions`. The transition logic moves into `admittedActions`.
- **`authorization/index.js`.**
  - `decideEachRow` calls the restriction checker for the page. It reads `statesByTarget` for the
    second answer.
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
  `GET /v2/states/archived/forbidden-actions`.
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
  - `stateAdmits` applies one-step archive, deletion, and the transition rows;
  - `decide` no longer returns `ARCHIVED` or `DELETED`.
- `worlds.js` replaces its restriction dimension with `archived`, with the values none, the
  resource, and the owning group.
- `modelCoverage.test.js` checks the state rules, not the restriction types.
- `engineArm.js` and `decisionTable.js` replace `blockedBy` with the state column, and
  `npm run model:table` regenerates the decision table.
- `operationSequences.test.js`:
  - asserts a sub-group stays mutable;
  - verifies with `assertStateAdmits`;
  - drops the archived-column invariant.
- `restrictions.test.js` becomes `state.test.js` cases. `restrictionTargets.test.js` is removed.
- `platformAdminShortCircuit.test.js` asserts 409 for a platform admin on an archived target.
- `restrictionLabels.test.js` reads the state route.
- `groups.invitations.test.js` moves from 403 to 409.

**Exit:** every test above passes, the Engine, List rows, Standing, and Transitions arms agree
with the reference model, and the full API suite passes.

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
  - Section K follows [E2E test flows](./e2e-test-flows.md).
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

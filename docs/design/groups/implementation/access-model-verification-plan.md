---
title: Access model verification plan
order: 8
status: active
implemented: shipped
last_verified: 2026-09-16
---

# Access model verification plan

The ordered work to state the v2 access model as a small formal model, and to show that the
code agrees with it in every state the code can reach.

All eight phases shipped on 2026-09-15, and this page is the record of that work. The model
itself is [Access model](../access-model.md), which is kept current. Decisions are in
[Decisions](../decisions.md). [What remains](#what-remains) lists the gaps between the goal and
what shipped.

After this plan shipped, the [restrictions plan](./restrictions-plan.md) removed the restriction
layer this plan built on. The engine no longer reads a resource's state. Each resource type
declares what its state admits under `src/state/builtin/`, and each service asserts it inside its
transaction, refusing with 409. Archiving reaches a group and what it owns, not its sub-groups.
The phase results below stay as measured, with a note where later work changed them.

## The problem, stated formally

Manual testing keeps finding cases nobody considered. Each one gets fixed where it surfaced.
The cause is structural. Nothing lists the cases, so nothing shows which ones were never
decided. The same question is also answered in several places, and those answers drift.

Four terms make the problem precise.

- A **state** is the contents of the access tables at one instant, together with the current time.
- An **operation** is anything that changes a state, such as adding a member, issuing a grant, or archiving a group.
- A **decision** answers one question: may user `u` take action `a` on resource `r` in state `S`?
- A **consumer** is any code that answers some version of that question. The policy engine is one consumer. List queries, capability lists, role badges, the UI persona, service guards, the import path, and every `v-if` in a v2 page that decides whether to offer a control are others.

The system is correct when five properties hold.

1. **Specification.** One written rule gives the decision for every state, user, action, and resource. The rule is total, so no combination lacks an answer.
2. **Agreement.** Every consumer gives the answer the rule gives. A list contains a resource exactly when its page opens. A badge names the paths the decision took.
3. **Invariants.** Every operation leaves the state satisfying the stated invariants. For example, no open access request names a resource that no longer exists.
4. **Coverage.** The test data contains every enum value, every registered action, and every operation. A test fails when a new value arrives unhandled.
5. **Extension.** Every rule, table, and check is stated over the registries rather than over a literal list, so a derived app that adds a resource type inherits all of them.

The mismatch between grants and roles is a failure of property 2. Access comes from grants and
from group structure. The UI shows one role word, and a separate first-match rule computes
that word. The word can therefore disagree with what the caller can actually do.

Property 5 follows from the engine's shape. It is a three-layer framework: `core/` is never
edited downstream, `builtin/` holds this application's policies, and `custom/` is the extension
point. A specification of `builtin/` alone would give a derived app nothing to inherit.

## The model

The model this plan set out to state is [Access model](../access-model.md). That page is the
specification, and it is kept current. This section records what the plan established and where
each part went.

A decision is a tuple, not a boolean. It holds whether the action is allowed, the paths that
allow it, the fields the caller sees, and the shape of a refusal. Resource state is a separate
question. The engine answers who may act, and the service asks `src/state` whether the resource
admits the action, refusing with 409. See
[Access model — The state check](../access-model.md#the-state-check).

### A decision returns its paths

A **path** is one reason a decision holds. A caller's **standing** on a resource is the set of
paths for that resource's read action. A badge displays standing and gates nothing.

The case that motivated it was one person with two reasons. Dana administers the Center, a lab
under the Center owns dataset D, and Dana also holds a `DATASET:DOWNLOAD` grant on D. First-match
role derivation stopped at `OVERSIGHT`, so the page could not explain the download. With paths,
the page holds both reasons.

Phase 5 built this. Detail routes send `_meta.standing`, every list row carries it, and the badge
reads it through one precedence table. The path forms and the badge vocabulary are in
[Access model — Paths and standing](../access-model.md#paths-and-standing).

### Projection: a path list, not a field set

An attribute filter is a list of path patterns applied by `projectObject`, not a list of field
names. Two findings shaped the model.

- **Negations do not union.** A negation is applied after every positive path, so concatenating a permissive rule with a negating one removes keys the permissive rule granted. Measured on 2026-09-15 with the one negation rule then in `group.js`: `['*', '!assignor']` joined with `['*']` returned `{a, b}`, not `{a, assignor, b}`.
- **First-match lost fields.** `dataset.js` ordered the oversight rule above the sensitive-grant rule, so an overseer who also held `DATASET:VIEW_SENSITIVE_METADATA` lost `staged_path`.

The model therefore defines the fields as the union of projected key sets over the caller's path
kinds. Phase 5 built that union, and `projectObject` copies with `copyTree`, keeping `Date`,
`BigInt`, and `Decimal`. The forms and the union are in
[Access model — Projection](../access-model.md#projection).

### Where the tables live, and how they change

Three tables are data the engine reads: the term table, the action table, and the attribute
table. `src/authorization/builtin/tables/index.js` builds them from the registered containers,
and `api/tests/model/tables.js` re-exports them, so the reference model reads the rows the engine
reads. What a resource's state admits is not one of these tables. Each resource type declares it
as rules under `src/state/builtin/`.

The tables live in code, beside the policies, and change as reviewed diffs. Only relations the SQL
joins are database tables: memberships, grants, the group closure, and the access-type order.
Where a constant must reach the database, it follows the grant vocabulary. The constants are in
`src/constants.js`, `prisma/seed_baseline.js` reconciles them, and `seed_baseline.test.js` checks
them with no database.

The harness does not check the tables themselves. It is the oracle for the code that interprets
them, so a wrong row shows only in review and in the generated decision table.

## What the analysis found

The findings came from reading the code on 2026-09-14 and 2026-09-15, before any phase ran. Each
row records one finding and where it was resolved. The full readings are in git history.

| Finding | Outcome |
|---|---|
| The dataset access rule was written by hand in four places, and collections and groups each added a copy | one statement, `accessPathsQuery`, in Phase 4; `explainDatasetAccess` deleted |
| One fact had several definitions: active membership, live grant, caller role, group visibility, and the grants an overseer may list | the views and `accessPathsQuery` in Phase 4; standing in Phase 5 |
| Every consumer, the engine included, read the platform-admin role from the login-time token | `current_roles` read from `user_role` on each request, Phase 3 |
| The restriction check allowed an action whose target it could not find, and creates never reached it | Phase 0 and Phase 6; the restrictions plan replaced the check with state rules that read the resource a row names |
| `userHasGrant` with no access types answered "any" | throws, Phase 0 |
| Four lists had no policy behind them | bound to an action and to `accessPathsQuery`, Phase 6 |
| Four `list` actions were `Policy.always` | retired, Phase 5 |
| The capability map reported `review` on a decided request, and the UI re-checked the status | capabilities consulted state in Phases 3 and 5; the restrictions plan moved state to `_meta.available_actions` |
| Grant listings carried whole `subject.user` and `grantor` rows | `base_attributes.grant` names every field, Phase 5 |
| `projectObject` turned a `Date` into a string and threw on `BigInt` under a negation, and `*` aliased the source row | `copyTree`, Phase 5 |
| `GET /v2/users` was an unfiltered directory for any group admin | three characters, ten people, four fields, Phase 6 |
| The UI answered "may this caller act" from four sources and re-derived six facts | standing, the `/v2/users/me` facts, and `uiScan.test.js`, Phase 5; state through `available_actions`, restrictions plan |
| No document said which effects of an operation were intended | the operations table in [Design — Lifecycle Management](../design.md#lifecycle-management), asserted by the sequence suite |
| `GET /groups/slug/:slug` passed its identifiers in the wrong shape and threw | the route passes `{ user, resource }` |
| Grant routes take `resource_id` and `resource_type` from the URL or the body | open |
| `picomatch` is declared in both `package.json` files and imported nowhere | open |

### Projection applied to rows it was not decided for

A filter is valid only for the resource whose decision produced it. Three routes broke that. The
lineage routes applied the parent dataset's filter to rows owned by other groups, and
`GET /groups/:id/ancestors` applied the caller's standing on one group to its ancestors. The
remedy already existed in `findDatasetRun`, which returns a child only under its own parent.

Phase 5 decides and projects each related row on its own resource. `relatedRowsArm.test.js` and
`relatedLineage.test.js` pin it.

### The static checks that already exist

The engine fails at import when a policy is malformed. `new Policy` validates `requires`,
`userHasGrant` validates its access type, and every container freezes. `seed_baseline.test.js`
checks the configuration tables with no database. A code check fails the process, and a data check
fails the build.

Phase 2 added three checks.

- `hydrateEveryAttribute.test.js` hydrates every declared attribute against a seeded row. Every hydrator defect found had been a request-time 500.
- `requiresCheck.js` compares each policy's `requires` with the schema columns and the registered virtual attributes at boot, and refuses an async `evaluate`.
- `dataset.workflow-gating.test.js` checks that the workflow-to-action map names registered actions.

## What was built

### The rule is a query

The rule lives in SQL because a list has to filter before `LIMIT`, `OFFSET`, and `COUNT`. A
filter applied after the database chose a page gets both the page and the total wrong. Policies
stay JavaScript, because that is what a derived app extends. The SQL form is a second way to
evaluate the same terms over many rows.

`accessPathsQuery` in `src/authorization/builtin/accessPaths.js` returns one row per path. Each
row names the resource, the path kind, and the group, grant, collection, and access type the path
runs through. Lists, single checks, standing, and capabilities all read it.

Three inputs stay outside the statement. The platform admin is checked once before it runs.
Attribute filters project the row afterwards. Terms that name no resource, such as `isRequester`,
stay hydrated policies. Phase 4 measured a detail check at a median of 3 queries, against 7
before.

### What compilation needs from `core`

A compiler needs the policy tree. `Policy.or`, `Policy.and`, and `Policy.not` keep their operator
and their children, and `policyTree.test.js` walks them.

Two other `core` facts had to change. The hydrator cache is keyed by type and id, and every
builtin container freezes. The cache key mattered in practice: a record with no id was cached
under one shared key, so two creates in one request were decided on the first owning group.
`nullIdHydration.test.js` pins it.

### Refusal of an under-specified question

An access check called without the information it needs raises instead of widening. `userHasGrant`
with no access types throws, as its SQL form already did. `userHasGrant.refusal.test.js` pins it.

### Paths replace the first-match role

`_meta.standing` replaced `_meta.caller_role`, and `deriveCallerRole` is gone. The badge reads
standing through one precedence table, and `badgeCoverage.test.js` fails when a path kind has no
row.

The Access tab shows for every viewer. A caller with `manage_grants` sees the grant table, and
everyone else sees `MyAccessTab`, which lists their paths.

### The persona goes

`uiPersona` was a third definition of "admin". `/v2/users/me` returns `is_platform_admin`,
`admin_group_count`, and `oversight_group_count` instead, and `stores/v2/me.js` reads them. No v2
file reads `auth.canAdmin`. `governanceCounts.test.js` pins the counts.

### One pipeline

The middleware and `authorizeAction` differed, because only the middleware filtered capabilities.
Both call `createDecisionPipeline` now. It answers a refusal with 404 when the caller holds no
standing on a dataset, collection, or group, and with 403 otherwise.

### Current state has one definition

The views `active_group_user`, `valid_grants`, and `active_collection_dataset` are the one
definition of "active", and every path fragment reads a view. `currentStateScan.test.js` scans
`api/src` for `removed_at: null`, `revoked_at: null`, and `is_archived: false`. It fails on any
hit outside an allowlist, and each entry names its reason.

## Verification harness

The harness lives in `api/tests/model/`. It compares consumers with a reference model over
generated worlds, and it drives random operation sequences.
[Access model — The UI consumption contract](../access-model.md#the-ui-consumption-contract)
names the test that pins each response shape.

### The isolated test database

The suites write many rows per run, and the harness writes thousands, so they cannot share the
database the running API reads. `api/tests/testDatabase.js` points every Jest process at
`<DATABASE_DB>_test` on the same server, before any Prisma client opens. `npm run test:db:setup`
migrates and seeds it. `tests/request.js` talks to the running API, so it uses the development
database.

### Reference model

`api/tests/model/reference.js` states the decision rule in plain JavaScript over in-memory
arrays. It never imports the engine, the services, or Prisma, but it reads the same three tables.

Its independence is weaker than it sounds. The reference was written from the design, and the
model was derived by reading the code, so the two can share a mistake the reading made. The
decision records and the cases manual testing found are the check on that.

It models three resource types: group, dataset, and collection. `decide` throws on any other.
`modelCoverage.test.js` fails on a registered type that is neither modelled nor listed in
`NOT_MODELLED`, which names the test that decides each remaining type.

`stateAdmits` is the reference's statement of what a resource's state admits. It is written from
each action's restriction class rather than from the state rules, so the two are independent
statements of the same thing.

### Worlds

A **world** is a set of groups, users, resources, and grants. `worlds.js` generates it, and
`dbWorld.js` writes it to the database while the reference model holds the same world in memory.
Each **cell** is one user and one dataset, over these dimensions:

| Dimension | Values | Count |
|---|---|---|
| caller | anonymous; signed in; platform admin; platform admin whose role was revoked after login | 4 |
| relation to the owning group | none; direct member; direct admin; member of a child; admin of the parent; admin of the grandparent; admin of a sibling; removed member; expired member | 9 |
| grant subject | the user; a group the user belongs to; a group the user left; Authenticated Users; Public | 5 |
| grant route | the dataset; a collection containing it; a collection whose row was removed | 3 |
| grant access type | the ten seeded types | 10 |
| grant validity | active; revoked; superseded; expired; not yet started | 5 |
| archived | none; the collection; the owning group; the parent group | 4 |
| deleted | no; yes | 2 |
| owner | an ordinary group; the quarantine group | 2 |
| seeded grant | present; revoked | 2 |
| profile visibility | `PRIVATE`; `AUTHENTICATED`; `PUBLIC` | 3 |
| contributions | off; on | 2 |

The owning group and the collection in a cell carry the resource-rule columns, so the same cells
decide group and collection actions. The parent-group archived value stays because it
discriminates: archiving a parent must not reach what a child owns.

Before constraints, the dimensions multiply to 5,184,000 cells. The database arms run on a
covering set of 110 cells, in which every pair of values appears at least once. They add
**sensitivity pairs**: for each dimension, two cells that differ only there and that the reference
decides differently. The generator fails a dimension with no such pair, because a dimension the
data cannot move is not being tested. No arm evaluates every cell, even in memory.

The coverage check reads enum values from the Prisma client, so a new value fails it. The
reference model also writes `docs/design/groups/generated/access-decisions.md`, with one row per
distinct standing and action. `npm run model:table -- --check` fails when that file is stale.

### Comparison arms

Each arm compares one consumer with the reference model for every user, action, and resource in a
world. Non-admin callers carry the weight, because a platform admin passes every policy.

| Arm | File | Compares |
|---|---|---|
| Engine, with creates | `engineArm.test.js` | `authorizeAction` from identifiers alone, and the create actions, with reference `allowed` |
| Paths | `pathsArm.test.js` | `accessPathsQuery` rows with the reference paths |
| Lists | `listsArm.test.js` | the list queries with the reference decision |
| List rows | `listRowsArm.test.js` | each list row's `_meta` with the detail route's own composition |
| Related rows | `relatedRowsArm.test.js` | lineage, ancestor, and descendant rows with each row's own decision |
| Standing | `standingArm.test.js` | `_meta.standing` with the reference paths |
| Transitions | `transitionsArm.test.js` | access-request capabilities in every status, for the requester, an admin, and a platform admin |
| State | `stateArm.test.js` | `state.check` on group, collection, and dataset rows with `stateAdmits` |

The Term forms arm ran in Phase 3. It was retired in Phase 4, once both forms of the grant term
read one statement.

Six arms the plan described were not built: Route, Capabilities, Projection, Refusal, Session, and
Unpoliced lists. The Row flags arm lost its subject when Phase 5 retired the flags. Some of the
unbuilt arms' questions have example tests instead. `refusalStatus.test.js` covers the 404 and
403 answers, and `attributeRuleOrdering.test.js` checks that attribute rules combine by union. No
test compares a route's `_meta.capabilities` or its projected fields with the reference model.

### Operation sequences

`operationSequences.test.js` drives `fast-check` command sequences against the real services and
the reference model together. It has 17 commands. The default budget is 30 runs of up to 25
commands, set by `MODEL_SEQUENCE_RUNS` and `MODEL_SEQUENCE_COMMANDS`. `fast-check` shrinks a
failing sequence, and `MODEL_SEQUENCE_SEED` replays it.

After every command, the suite compares the database with the operations table and the engine
with the reference model. Sequential commands find no races. The concurrency suites own those,
and database constraints hold the rules that need them.

### The UI layer

The browser is never the gate, and it gets no matrix. The API refuses on its own, so the UI's risk
is the mapping from a response to a control. That mapping is stated once, as
[Access model — The UI consumption contract](../access-model.md#the-ui-consumption-contract). A
page gates on what the API sent, and never re-derives state, identity, grant activity,
implication, or whether a caller may request access.

`uiScan.test.js` runs in the API suite and fails on a v2 file that re-derives from raw fields what
the API decides. Each allowlist entry states its reason. The Playwright suite in `e2e/` checks
flows through the browser. No pass renders every standing and compares the controls offered with
the capabilities sent.

## Phases

Each phase ends with an exit criterion that a test or a count can check.

### Phase 0: close the live holes

L1 T11, T12, and T13 are live today and do not need the harness.

- The fix for T11 is the target-shape change to the restriction check, so this phase builds that part.
- T12 whitelists the fields `PATCH /v2/datasets/:id` accepts.
- T13 moves the last-admin check into the removal transaction.
- `userHasGrant` throws when given no access types, and the two lifecycle tests that pass `access_type_id` are corrected so they can fail.
- The legacy `PATCH /datasets/:id` passes its body through the same way. It is v1, so it is recorded in [v2 cut-over](../../v2-cutover.md) and not changed.

**Exit:** one refusal test per item fails before the fix and passes after it.

**Later.** The T11 fix changed the restriction check. The restrictions plan replaced that check.
A grant or an access request now reads the state of the resource it names, through
`src/state/builtin/targets.js`.

### Phase 1: write the model page

A new page, `access-model.md`, holds the base relations, the derived relations, the decision
tuple, the four planes, paths, projection, the full refusal list with the 409 body, non-edges,
the non-escalation rule, field provenance, invariant ownership, time, the transition table, the
badge vocabulary with its precedence, the UI consumption contract, the validity window of
download and upload tokens, and the operations table with a decision in every cell. The open
decisions below are answered with the owner, and each answer goes to
[Decisions](../decisions.md).

**Exit:** no operations-table cell is undecided, every non-edge is listed with its test, every
invariant names its owning layer, every action on a stateful resource has a transition row,
every path kind has a badge word, every response shape a v2 file gates on has a contract row,
every accept-shaped operation is checked against the non-escalation rule, and every open
decision is answered or explicitly deferred.

### Phase 2: the four tables, the reference model, and worlds

The isolated test database comes first. Then four small framework fixes, each of which a check
in this phase depends on: `PolicyRegistry` gains `listTypes()` so `restrictions.test.js` stops
hard-coding six resource types, `user.js` and `audit.js` call `freeze()`, the resource cache
is keyed by type and id rather than id alone, and `.actions()` accepts a restriction class and
a transition row beside each policy so a container carries its own table rows. This phase then
builds:

- the term, action, attribute, and transition tables under `src/authorization/builtin/tables/`, and the reference model over them
- the CI check that projects one seeded row of each resource type through every attribute rule, and reports each rule list whose results are not ordered by set inclusion
- the boot-time check comparing every policy's `requires` against the schema columns and the registered virtual attributes
- the CI check that hydrates every declared attribute against one seeded row of each type
- the completeness test for the `policyActionFor` workflow map
- the world generator, including the anonymous caller, the stale-session admin, the quarantine group, the seeded grant, the resource-rule settings, the state dimension, and the constraint list for impossible combinations
- the coverage and sensitivity checks
- the generated decision table with its `--check` mode

**Exit:** the coverage check passes for every enum and every registered action, iterating the
registry. The sensitivity check passes for every dimension. Every declared attribute hydrates.
Every container is frozen. The ordering check reports the `dataset.js` rule lists, and nothing
else it reports is a surprise. The generator reports the engine-arm cell count and its run time.

**Later.** The transition table did not become a fourth table. The per-resource state rules under
`src/state/builtin/` enforce it, so `src/authorization/builtin/tables/` builds three tables.

### Phase 3: static agreement

Every comparison arm runs, and every disagreement is classified. Bugs get fixed. Gaps in the
specification go to Decisions.

**Exit:** no disagreement is unclassified. Each fixed bug has a harness cell that failed before
the fix. The six known disagreements were found.

**Result, 2026-09-15.** The harness writes the covering world, 110 cells, into `app_test`.
The Engine arm decides 6,600 actions from identifiers alone, and 114 disagreed on the first run.

- Two were bugs, now fixed. `group.add_dataset` admitted any caller to a group accepting
  contributions, the anonymous principal included, because its term read only the flag. A grant
  to a system principal made its owning group visible, against decision 16 row 8. Cells 3 and 47
  failed before the fixes.
- The remaining 107 are one class. A deleted dataset still admits mutating and data-plane
  actions, which decision 16 row 4 refuses. `tests/model/engineArm.test.js` classifies them for
  Phase 6, and fails if the class stops matching.
- The Term forms arm found `getGrantAccessTypesForUser` and `accessibleDatasetIdsByGrantsQuery`
  in agreement for every signed-in user and every dataset access type.
- The Creates arm found `dataset.create` and `collection.create` blocked by an archived owning
  group and by an archived ancestor, as Phase 0 made them.
- The Transitions arm found `review`, `update`, `submit`, and `withdraw` offered in states the
  transition table forbids. Capabilities now consult the table, including a platform admin's.
- The Session disagreement was real in the engine, not only in the route. Routes seed the JWT
  profile, with its login-time roles, into the policy context. The platform-admin term now reads
  `current_roles` from `user_role`, which no profile carries.

The ten known disagreements stand as follows.

| Disagreement | Where it is found | Status |
|---|---|---|
| group role precedence | Standing arm | Phase 5 replaces the first-match role with paths |
| group search leaving out resource access | Lists arm | Phase 4 |
| expiring grants for overseers | Lists arm | Phase 4 |
| an archived ancestor on create | Creates arm | fixed in Phase 0 |
| an overseer with a sensitive-metadata grant losing `staged_path` | `attributeRuleOrdering.test.js` | pinned; Phase 5 unions projections |
| lineage rows carrying the parent dataset's field set | Related rows arm | Phase 5 |
| a grant listing carrying full `subject.user` and `grantor` rows | Projection arm | Phase 5 |
| `review` reported on a request no longer `UNDER_REVIEW` | Transitions arm | fixed in Phase 3 |
| a platform admin refused `edit_metadata` on a quarantined dataset | Engine arm | agreement: an archived group binds platform admins, as decision 11 says |
| the route admitting a platform admin whose role the database no longer holds | Session | fixed in the engine in Phase 3; route-level list branches that read the session remain, filed in L1 |

**Later.** The quarantine row still agrees, but not through a restriction. The dataset state rule
refuses `edit_metadata` while the owning group is archived, for every caller, with 409.

### Phase 4: the rule becomes a query

This phase begins in `core/`. `Policy.or`, `Policy.and`, and `Policy.not` keep their operator
and their child policies, so a composed policy can be walked. Without that, a compiler cannot
turn `Policy.or([a, b, c])` into a `UNION`, and the rest of this phase has nothing to compile
from.

It then builds `accessPathsQuery` for datasets, collections, and groups, starting from
`createAccessibleDatasetIdsCte`, and moves each consumer onto that statement:

- the dataset list, collection search, group search, expiring grants, and `viewableDatasetIds`
- the single checks for the builtin dataset, collection, and group policies
- `coverage.js`
- the four repeated `isPlatformAdmin(req)` branches in the list handlers

It deletes the duplicate helpers and `explainDatasetAccess`, and adds the base-table scan test.
The `grant.js` resource-group terms move their service reads into a hydrator virtual attribute,
so `requires` becomes true again and a boot check can flag any async `evaluate`.

**Exit:**

- No list query or builtin policy restates a term.
- The scan test passes with only history readers on its allowlist.
- No policy declares facts it does not read, and none reads facts it does not declare.
- The harness stays green.
- The median query count and latency of a detail-page check are measured before and after the change.

**Result, 2026-09-15.** The builtin dataset, collection, and group terms, the three searches,
expiring grants, and coverage read `accessPathsQuery`. The Paths and Lists arms compare it with
the reference model, and the Engine, Creates, and Transitions arms stay green.

Found by the e2e run after Phase 7. Pointing `collection.datasets` at the
`active_collection_dataset` view broke `createCollection` with `dataset_ids`, which still wrote
through that relation. No API test created a collection with datasets. The create now writes
through `dataset_history`, and `collections.lifecycle.test.js` covers it.

- The group search now lists a group through a grant on a resource it owns. Five signed-in
  cells in the covering world reach their group only that way, so the Lists arm could fail.
- Expiring grants now include the grants an overseer may list.
- Coverage no longer reports a collection access type as coverage of a dataset in the
  collection. The engine never honoured one, so coverage was advising access nobody had.
- The grant terms read `resource_owner_group_id` from the grant hydrator. No `evaluate` is
  async, and the boot check refuses one.
- The list handlers read platform admin from `user_role` through `callerIsPlatformAdmin`.
- The Term forms arm is retired. Both grant term forms read `accessPathsQuery` now, so their
  agreement is forced rather than found.

A detail check was measured on 63 checks in the covering world, interleaving the Phase 3 commit
with this phase's code three times each.

| | median queries | max queries | median ms, three runs | p90 ms, three runs |
|---|---|---|---|---|
| before | 7 | 9 | 2.9, 4.8, 4.8 | 6.6, 7.9, 7.3 |
| after | 3 | 5 | 5.0, 6.4, 7.9 | 7.4, 9.3, 11.3 |

The query count fell as estimated. Latency rose in every pair, by about 1.5 to 3 ms at the median.
The cause is not measured.

Three departures from the plan as written:

- **The scan allowlist is not only history readers.** It also names writes that set a column or
  target the open row they change, a display count, and the owner-group eligibility reads Phase 6
  moves to the restriction check. Each entry states its reason, and a stale entry fails.
- **The views are Prisma models.** `group.members`, `collection.datasets`, and
  `dataset.collections` read `active_group_user` and `active_collection_dataset`, and the base
  relations take `_history` names. Unfiltered reads of removed rows became correct without
  editing each caller. Prisma cannot order by a count through a view relation, so the platform
  admin's collection search ranks by dataset count in memory.
- **A create's check reads the owning group's paths.** A create has no resource id, so the
  context identifiers carry the pre-fetched resource as `prospective`, and `access_paths` reads
  the owning group's `admin`, `oversight`, and `member` rows.

### Phase 5: paths, standing, and projection

This phase builds everything the target shape describes for paths and fields:

- Capabilities and `_meta.standing` come from the path rows, and `_meta.standing` replaces `_meta.caller_role`. Capabilities on a stateful resource consult the transition table, so `review` disappears from a decided request.
- List rows carry `_meta.capabilities` and `_meta.standing` in the same shape as detail routes, which retires `user_role`, `can_view_metadata`, and `can_request_stage`.
- The API sends `withdraw`, `request_access`, `is_active` on grant rows, and a revoke preview, and the client re-derivations in the UI-layer table are deleted.
- Attribute rules combine by key-set union over the matching path kinds, so a negation suppresses a key only when no other matching rule grants it positively. The Phase 2 ordering report says which rules change behaviour.
- `projectObject` stops deep-cloning through `JSON.parse(JSON.stringify(...))`, so a negation no longer throws on `BigInt` and no longer turns a `Date` into a string, and `'*'` stops aliasing nested objects back to the source row.
- The three related-row routes scope their queries to the parent, following `findDatasetRun`.
- The badge reads standing.
- The Access tab appears for every viewer.
- The persona gives way to the three facts from `/v2/users/me`, and no v2 file reads `auth.canAdmin`.
- `base_attributes.grant` drops `'*'` and names the fields a grant listing may carry, so the subject and grantor rows stop going on the wire whole.
- The four `Policy.always` list actions retire or gain a list-filter row, as decision 16 says.
- The UI scans run in CI.

**Exit:** the standing, projection, related-row, transitions, and row-flag arms are green, and
the UI scan passes with an empty allowlist beyond display-only text.

**Result, 2026-09-15.** Detail routes send `_meta.standing`, and every list row carries
`_meta.capabilities` and `_meta.standing` from `decideRows`. The Standing, List rows, and Related
rows arms compare them with the reference model and with the detail route's own composition. The
full API suite passes, 96 suites.

- `projectObject` copies containers with `copyTree` and keeps `Date`, `BigInt`, and `Decimal`.
  Attribute rules merge their projections, and the ordering test now checks union.
- `deriveCallerRole`, `.roles()`, and `user_role` are gone. The badge reads standing through one
  precedence table, and `badgeCoverage.test.js` checks every standing kind has a row.
- `request_access` is appended on the dataset and collection detail routes. `withdraw` and
  `review` come from the transition table. Grant rows carry `is_active`, pinned to
  `valid_grants`. `GET /grants/:id/revoke-preview` reads coverage over every path, and
  `RevokeGrantModal` no longer walks `implies`.
- The lineage, ancestor, and descendant routes project each row by its own decision. The
  lineage tab linked rows by the integer id, which the detail route refuses; it links by
  `resource_id` now.
- `base_attributes.grant` names every field, and grouped lists project subject, resource, and
  coverage rows.
- `/v2/users/me` returns `is_platform_admin`, `admin_group_count`, and
  `oversight_group_count`. `stores/v2/me.js` replaces `uiPersona`, and no v2 file reads
  `auth.canAdmin`.
- The four `Policy.always` list actions are retired, and list routes bind no `authorize()`.
- The Access tab shows for every viewer, and `MyAccessTab` lists the caller's standing.
- `uiScan.test.js` runs in the API suite and passes.

A browser check on the development database confirmed the dashboard, group list, and group page
for an overseer. A temporary platform-admin role on a caller with no memberships was offered
Archive and not Unarchive on an active group, then removed.

Six departures from the plan as written:

- **Group and collection `archive` and `unarchive` gained transition rows.** The plan says the
  capability map already omits a blocked action. It did for ARCHIVED, but `unarchive` is exempt
  from ARCHIVED and `archive` was offered on an archived resource. The middleware's platform-admin
  branch also returned every action without consulting transitions. Both are fixed, and the
  twelve client copies on the group and collection pages are deleted.
- **A list row's badge leaves out `platform_admin`.** It would repeat on every row, so
  `rowBadgeFor` shows the caller's relation to the row itself. The detail badge keeps it.
- **List rows are decided one at a time over batched reads.** The plan joins lists on the path
  statement. A page reads its paths and restrictions once and then runs each row through the
  detail composition, which is what the List rows arm checks.
- **The UI scan's status rule covers access-request statuses only.** Workflow, upload, import,
  and invitation states are not in the access model's transition table.
- **The dataset overview keeps `canArchive && !is_deleted`.** Nothing blocks a mutation on a
  soft-deleted dataset until decision 4 lands in Phase 6. The scan allowlists it with that reason.
- **A resource's Requests tab still picks its list from `canReview`.** Every request list row
  carries `_meta`, and the single resource-scoped list is filed as L1 T16.

The sidebar needed no change. Its `auth.canAdmin` gates only the v1 admin items.

Found by the e2e run after Phase 7. `GET /access-requests/requested-by-me` answered 500 for any
caller with a request. `decideRows` passes each row as the pre-fetched resource, and
`PrismaHydrator` copied it with `structuredClone`, which rejects the computed fields the extended
Prisma client puts on `access_request_item`. The hydrator copies with `copyTree` now, and
`hydrateExtendedRows.test.js` covers it. The harness spec still asserted `uiPersona`, and now
asserts the three facts `/v2/users/me` returns.

**Later.** The restrictions plan split capabilities from state. `_meta.capabilities` is the
caller's authority alone, and `_meta.available_actions` reports what the state admits. The
`archive` and `unarchive` transition rows and the dataset overview's `canArchive && !is_deleted`
gate both became state rules, read through `available_actions`.

### Phase 6: restrictions, operations, and creates

- The eleven `is_archived` guard sites call one `isRestricted` helper reading `effective_restriction`, inside the transactions they already open. The four message constants become one, and the archive confirmation modals read their prohibited-action lists from the restriction class column.
- The four unpoliced lists bind to an action and read `accessPathsQuery`.
- Action rows declare a restriction class, and `MUTATING_ACTIONS` and `READING_ACTIONS` are deleted.
- The effects decided in Phase 1 are implemented, and the operation-sequence suite is built.

**Exit:**

- The seeded budget runs clean.
- Every operations-table cell has an assertion.
- A descendant of a group archived mid-transaction is refused by line 2, not only by line 1.
- Reverting one decided effect by hand makes the suite fail. That proves the suite can see the effect.

**Result, 2026-09-15.** Action rows declare a restriction class, and the restriction types read
their blocked actions from those rows. The eleven guard sites call `isRestricted` under the
transaction they open. The operation-sequence suite runs clean at its default budget. The full
API suite passes, 102 suites, and `public.cache.test.js` passes on its own.

- `RESTRICTION_CLASS` holds `mutating`, `reading`, and `data`. ARCHIVED blocks the mutating
  class, and DELETED blocks the mutating and data classes. Both exempt `unarchive`.
  `MUTATING_ACTIONS` and `READING_ACTIONS` are deleted, and `engineArm.test.js` classifies no
  disagreement.
- `serviceGuards.test.js` archives a parent group inside an open transaction and then adds a
  member to its child. Line 2 refuses the change with a 409.
- The four archive messages are one, `RESTRICTED_MESSAGE`.
- The group and collection archive dialogs list the actions `GET /v2/restrictions/:type/blocked-actions`
  returns. `restrictionLabels.test.js` fails when a blocked action has no label. (Both names
  changed afterwards: the restrictions plan replaced the route with
  `GET /v2/states/:type/archived/forbidden-actions`, served from each resource type's own state
  rules, and renamed the test to `stateLabels.test.js` and the UI table to `stateLabels.js`.
  The check itself is unchanged.)
- A collection that has held a dataset, or has any access request, refuses deletion. The
  capability map leaves `delete` out, and `deleteCollection` answers 409 under a row lock.
  (Later removed: a collection has no delete at all.)
- A search of `GET /v2/users` by a caller who is not a platform admin needs three characters.
  It returns at most ten people and four fields.
- `/my-pending-reviews` reads the admin rows of `accessPathsQuery`. `/eligible-owner-groups`
  reads the caller's group path rows and decides `dataset.contribute` for each candidate.
- `operationSequences.test.js` runs 30 sequences of up to 25 commands over 17 operations. It
  compares the database with the operations table, and the engine with the reference model,
  after every command. Removing the `isRestricted` guard from `addGroupMembers` made it fail on
  seed 617108713: adding a user to an archived group's child answered 200, not 409.
- Every operations-table cell has an assertion. The sequence suite holds eleven rows. The
  profile cache cell is `public.cache.test.js`. The owner-change cell is
  `route_policy_bindings.test.js`. Reparenting is not built.

One bug was found and fixed on the way. `PrismaHydrator` cached a record with no id under the
key `dataset:global`. Two creates in one request were then decided on the first owning group.
`/eligible-owner-groups` offered a member a group that refuses contributions.
`nullIdHydration.test.js` pins it.

Nine departures from the plan as written:

- **DELETED is a restriction type derived in `effective_restriction`.** Decision 4 needed a
  soft-deleted dataset to refuse data-plane actions. A `restriction` row written at soft-delete
  could drift from `dataset.is_deleted`, so the view reads the column.
- **The archive dialogs read an endpoint, not a column.** The blocked actions come from the
  registry, which the UI cannot import.
- **The middleware and `authorizeAction` share one pipeline, `createDecisionPipeline`.** A
  refusal on a named resource answers 404 when the caller holds no standing on it, and 403
  otherwise. The e2e specs expect the
  new status through `expectConcealed`, and they were not run, because the development database
  holds the demo world and not the flows cast. When they ran after Phase 7, B4 and F10 found the
  rule too wide. `GET /grants/resource/DATASET/:id` authorizes the `grant` container on a dataset
  id, and a member of the owning group holds no grant-container term, so they were answered 404.
  Concealment now applies only to dataset, collection, and group, and `refusalStatus.test.js`
  covers both answers.
- **A refusal carries standing when standing was asked for.** The Standing arm found refused
  callers with resource-rule standing reported as having none.
- **`/requested-by-me` and `/reviewed-by-me` read the caller's own rows by column.** Neither
  list is scoped by a path. Each row is decided by `decideRows` for `read`.
- **The eligibility decision moved to the route.** `listOwnerGroupCandidates` returns path
  rows, and the route asks the engine. The service no longer restates the contribute rule.
- **Collection deletion is a transition on a hydrator virtual attribute, `has_history`.** The
  service guard repeats the count under a row lock, because the capability map is read before
  the transaction. (Collection delete was later removed. A collection is archived instead, and
  the `has_history` attribute went with it. See decision 16, row 6.)
- **Two commands and two cells are checked narrower than the table.** Soft-deleting a user
  writes the flag with Prisma, because no v2 service deletes an account. Invitations and
  requests are checked as the invitation token's status and the `review` restriction, not as
  rows in the model world.
- **Four commands skip restricted targets.** Promote, demote, grant, and revoke generate no
  command on a restricted target. Their services open no guard, so line 1 refuses them.
  `restrictions.test.js` covers that refusal through `checkRestriction`.

**Later.** The restrictions plan replaced this phase's restriction work. `isRestricted`,
`effective_restriction`, `RESTRICTED_MESSAGE`, and the DELETED restriction type are gone, and the
guard sites call `state.assertPossible`. Decision D2 also reversed one exit criterion. Archiving no
longer reaches a sub-group, so adding a member to an archived group's child is admitted. The
seed 617108713 failure recorded above is now the correct answer, and `serviceStateChecks.test.js`
pins it.

### Phase 7: keep it true

The v2 page patterns gain a checklist item. A new enum value, action, operation, or restriction
type extends the model page, the reference model, and the four tables. The tests from Phases 2
and 5 enforce this. The `authorization-engine` and `api-tests` skills record what the harness
taught.

**Exit:** adding a throwaway enum value in a scratch branch fails the coverage check, and
registering a throwaway container in `custom/` fails the action-table check.

**Result, 2026-09-15.** The v2 page patterns carry a checklist for a change to the access model.
Both exit checks fail on a scratch branch, which was deleted afterwards.

- A `THROWAWAY` value on `GROUP_MEMBER_ROLE`, after `prisma generate`, fails
  `modelCoverage.test.js` on `GROUP_MEMBER_ROLE`.
- A container registered in `custom/` with bare policies, as `custom/README.md` showed, fails
  `registryCompleteness.test.js` on `throwaway.view` and `throwaway.edit`.
- A container that declares `reading` and `mutating` on every action fails
  `modelCoverage.test.js` on "resource type throwaway".
- The control, with no throwaway, passes both suites.

One departure from the plan as written:

- **A resource-type check was added, because the declared container passed.** Before it, a
  container with a restriction class on every action and a path kind on every term passed every
  suite. It extended neither the model page nor the reference model. `reference.js` now exports
  `MODELLED_RESOURCE_TYPES`, and `decide` throws on any other type. `modelCoverage.test.js` fails
  on a registered type in neither that list nor `NOT_MODELLED`. Each `NOT_MODELLED` entry names
  the test that decides the type instead. The check proves a new type was placed, not that it was
  placed correctly.

`custom/README.md` now shows actions with a restriction class, terms with a path kind, no
platform-admin term, the real registration calls, and the placement step. The same stale example
in two other READMEs is filed as L2 T22.

**Later.** The restrictions plan added a second completeness check. The server refuses to start
while a policy action has no state rule, and `tests/state/sync.test.js` pins it.

## Decisions the model forces

The plan raised nineteen questions the code could not answer, from what removal does to a direct
grant to what the UI may compute. Decision 16 in [Decisions](../decisions.md) answers all nineteen,
and each answer is stated in [Access model](../access-model.md) or in the operations table of
[Design — Lifecycle Management](../design.md#lifecycle-management).

## Out of scope

- **v1 routes.** They retire at cut-over, as [v2 cut-over](../../v2-cutover.md) describes.
- **Races.** The concurrency suites own them, and database constraints enforce the rules that need one.
- **The cost of the view queries.** Phase 4 measured a detail check, and any further performance work is measured separately.
- **Bounded model checkers such as Alloy or TLA+.** They earn their cost when the hierarchy changes during its lifetime. Reparenting or delegated authority would be that trigger.

## How this is settled

The plan set five conditions. Their standing on 2026-09-16:

| Condition | Standing |
|---|---|
| The model page has a decision in every cell | holds; decision 16 answers every open question, and the operations table decides every cell |
| The generated table passes `--check` in CI | passes when run; the repository has no CI job that runs it |
| The engine, capabilities, lists, standing, projection, and refusal shapes agree with the reference model on every world cell | the engine, lists, list rows, related rows, standing, and state agree on the covering set; capabilities, projection, and refusal have no arm; no arm runs every cell |
| The seeded operation sequences run clean | holds at the default budget |
| A new enum value, action, or container fails a test until someone handles it | holds, as Phase 7 measured; the server also refuses to start while a policy action has no state rule |

## What remains

These are the gaps between the goal and what shipped. A later plan takes them up.

- **No CI.** Every check on this page runs only when someone runs it.
- **Nothing checks that a service asserts state.** Services call `state.assertPossible` at 36 sites, and no test asserts that every mutating action reaches one.
- **No route-level arm.** Nothing compares a route's `_meta.capabilities`, `_meta.available_actions`, projected fields, or refusal status with the reference model.
- **Pairs, not triples.** The database arms cover every pair of dimension values, so a defect that needs three conditions at once can pass. Each cell also holds one grant, so overlapping grants are never modelled.
- **Five types outside the model.** Grants, access requests, invitations, users, and audit are decided by example tests, not by the reference model.
- **Request facts.** Grant routes read `resource_id` and `resource_type` from the URL or the body.

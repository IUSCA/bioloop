# Access model verification plan

The ordered work to state the v2 access model as a small formal model, and to show that the
code agrees with it in every state the code can reach.

The design record stays in [Design](./design.md) and [Decisions](./decisions.md). This page
carries the formal statement of the problem, the findings behind it, the target shape, the
test harness, and the sequence.

## The problem, stated formally

Manual testing keeps finding cases nobody considered. Each one gets fixed where it surfaced.
The cause is structural. Nothing lists the cases, so nothing shows which ones were never
decided. The same question is also answered in several places, and those answers drift.

Four terms make the problem precise.

- A **state** is the contents of the access tables at one instant, together with the current time.
- An **operation** is anything that changes a state, such as adding a member, issuing a grant, or archiving a group.
- A **decision** answers one question: may user `u` take action `a` on resource `r` in state `S`?
- A **consumer** is any code that answers some version of that question. The policy engine is one consumer. List queries, capability lists, role badges, the UI persona, and service guards are others.

The system is correct when four properties hold.

1. **Specification.** One written rule gives the decision for every state, user, action, and resource. The rule is total, so no combination lacks an answer.
2. **Agreement.** Every consumer gives the answer the rule gives. A list contains a resource exactly when its page opens. A badge names the path the decision took.
3. **Invariants.** Every operation leaves the state satisfying the stated invariants. For example, no open access request names a resource that no longer exists.
4. **Coverage.** The test data contains every enum value, every registered action, and every operation. A test fails when a new value arrives unhandled.

The mismatch between grants and roles is a failure of property 2. Access comes from grants and
from group structure. The UI shows one role word, and a separate first-match rule computes
that word. The word can therefore disagree with what the caller can actually do.

## The model

### Base relations

Each base relation is one table. Rows carry validity columns, so each relation is a set of
facts over time.

| Relation | Meaning | Source |
|---|---|---|
| `platform_admin(u)` | `u` holds the `admin` role | `user_role` |
| `member(u, g, role, interval)` | `u` belongs to `g` as `MEMBER` or `ADMIN` | `group_user` |
| `ancestor(g, h, depth)` | `g` is an ancestor of `h` | `group_closure` |
| `owns(g, r)` | `g` is the owning group of `r` | `dataset.owner_group_id`, `collection.owner_group_id` |
| `contains(c, d, interval)` | collection `c` holds dataset `d` | `collection_dataset` |
| `grant(s, r, t, interval, revoked)` | subject `s` holds access type `t` on `r` | `grant` |
| `implies(t, t2)` | holding `t` satisfies a check for `t2` | `grant_access_type_implication` |
| `restriction(target, type, interval)` | the target is one group or one resource | `restriction` |
| `deleted(d)` | dataset `d` is soft-deleted | `dataset.is_deleted` |
| `system_principal(g)` | `g` is Public or Authenticated Users | seeded ids |

Ten access types exist. Their order is a small forest:

- `DATASET:DOWNLOAD`, `DATASET:COMPUTE`, and `DATASET:REMOTE_ACCESS` each imply `DATASET:LIST_FILES`.
- `DATASET:LIST_FILES`, `DATASET:VIEW_SENSITIVE_METADATA`, `DATASET:LIST_SOURCE_DATASETS`, and `DATASET:LIST_DERIVED_DATASETS` each imply `DATASET:VIEW_METADATA`.
- `COLLECTION:LIST_CONTENTS` implies `COLLECTION:VIEW_METADATA`.

### Derived relations

Each derived relation has exactly one definition. Every consumer reads that definition.

- **`active(x, now)`** holds when `x` is not removed, revoked, or lifted, its start is not after `now`, and its end is null or after `now`. One predicate serves memberships, grants, collection rows, and restrictions.
- **`effective_member(u, g)`** holds when `u` has an active membership in `g` or in any descendant of `g`. Membership flows upward.
- **`admin(u, g)`** holds when `u` has an active `ADMIN` membership in `g` itself. Authority does not flow.
- **`oversees(u, g)`** holds when `u` is admin of a strict ancestor of `g`.
- **`subjects(u)`** is the set of subjects that can confer access on `u`. It holds `u`, every group `u` is an effective member of, Authenticated Users when `u` is signed in, and Public.
- **`holds(u, r, t)`** holds when some active grant satisfies three conditions. Its subject is in `subjects(u)`. It names `r` or a collection that actively contains `r`. Its type implies `t` through the closure.
- **`restricted(r, a)`** holds when an active restriction blocks action `a`. The restriction may sit on `r`, on the owning group of `r`, or on an ancestor of that group.

### The decision rule

```text
allowed(u, a, r) =
  not restricted(r, a)
  and ( platform_admin(u)
        or structural(u, a, r)
        or holds(u, r, required_type(a)) )
```

`structural(u, a, r)` covers the terms that need no grant. They are `admin` of the owning group
for governance actions, and `admin` or `oversees` for governance reads.

Today, the terms each action accepts exist only as code inside the `.actions({...})` blocks of
the policy files. This plan lifts them into an **action table**. The action table has one row
per action. Each row names the terms the action accepts and the access type a grant must
satisfy. The table is data. The policy code and the SQL query both read it, so it becomes the
specification. Phase 2 builds it as `api/tests/model/actions.js`.

The table needs 73 rows, one for each registered action. The count was taken on 2026-09-14 by
calling `policyRegistry.get(type).getActionNames()` for every registered container. It comes to
23 dataset, 21 group, 16 collection, 7 grant, 4 access request, 1 user, and 1 audit.

This page writes the rule as a formula. In the code it lives next to the data, as one SQL
statement that both lists and single checks run. [The rule is a query](#the-rule-is-a-query)
describes that shape.

### A decision returns its paths

A decision returns every reason that makes it true, not only a boolean.

A **path** is one such reason. It takes one of five forms: `platform_admin`, `admin(g)`,
`oversight(g)`, `member(g)`, or `grant(id)`. A `grant` path also records its subject and the
collection it arrived through.

A caller's **standing** on a resource is the set of paths for that resource's read action. A
badge is a display function of standing and gates nothing. Tabs and buttons gate on
capabilities only.

Consider one person. Dana administers the Center. A lab under the Center owns dataset D. Dana
also holds a `DATASET:DOWNLOAD` grant on D. Her standing on D is `{oversight(Center), grant(#42)}`.

- **Today:** `deriveCallerRole` stops at the first matching rule and returns `OVERSIGHT`.
- **The consequence:** the dataset page shows its Access tab only for `manage_grants` or `GRANT_HOLDER`. Dana therefore sees nothing explaining why she can download D.
- **With paths:** the page holds both facts and can show both.

### Time

The current time is an input to every derived relation, and "active" has one definition.
Tests control time by writing rows whose intervals already lie in the past or the future. They
never move a clock.

This leaves one gap. No test observes a row crossing its expiry partway through a sequence.
That is acceptable, because every read recomputes `active` from `now`.

## What the analysis found

These findings come from reading the code on 2026-09-14. One claim was run, and it is marked.
Every other claim was read and not run. The defects are filed in the local backlog, under L1
T11–T13 and L2 T19–T21.

### Agreement: one fact with several definitions

| Fact | Definition A | Definition B | Effect |
|---|---|---|---|
| Active membership | `active_group_user`: not removed, and `valid_until` not passed | `group_user` with `removed_at: null` only, in `groupService.isGroupAdmin`, `access_requests/request.js`, and `ensureNotRemovingLastAdmin` | Latent, because nothing writes `valid_until` yet. Once expiry ships, an expired admin keeps the group-admin persona and can still file group requests. |
| Archived | `effective_restriction`, which reaches descendants | the row's own `is_archived`, in `getOwnerGroupForAuthorization`, `addDatasets`, `removeGroupMembers`, and the invitation service | A child of an archived group is offered as a dataset owner. Create actions carry no resource id, so the engine skips its restriction check. |
| Live grant | `valid_grants`: started, not expired, not revoked | `access_summary.js`: not expired and not revoked, with no start check | Latent, because every API issuance starts at the current time. |
| Caller role on a group | engine: `ADMIN`, then `OVERSIGHT`, then `MEMBER`, then `RESOURCE_ACCESS` | `searchGroupsForUser` SQL: direct role, then `OVERSIGHT`, then `TRANSITIVE_MEMBER` | A direct member of a group who also administers its parent reads `OVERSIGHT` on the page and `MEMBER` in the list. |
| Group visibility | `group.view_metadata` admits a holder of a grant on a resource the group owns | group search with scope `all` omits that term | A grant holder can open a group page that no list shows them. |
| Grants an admin may see | `grant.list_for_resource` admits admins and overseers | `listExpiringGrantsForAdmin` admits direct admins only | An overseer sees fewer expiring grants than the page lets them read. |
| Platform admin | engine: `roles.includes('admin')` | `auth.canAdmin`, from a login-time cache and case-insensitive; the persona, from `/v2/users/me` | Three reads of one fact. The cached copy can go stale. |
| Group admin, for the UI | persona `group_admin`, which is never set for a platform admin | `home.vue` accepts either persona; `RequestSubjectSelector.vue` checks `group_admin` only | A platform admin who also administers a group gets no "A group I administer" option. |

The pattern has happened before. In L1 T10, `POST /collections/search` filtered on a literal
list of access types while the page widened through the closure.
`api/tests/services/grants/listVisibility.test.js` now checks both lists against the page for
nine grant shapes. Against the old code it failed four of ten. That test is the seed of the
agreement harness below.

`explainDatasetAccess` in `services/datasets_v2/index.js` is one more derivation. It has no
callers, passes its arguments in the wrong shape, skips the closure, and would let overseers
download. It should be deleted, not fixed.

### Totality: combinations with no answer

- **The restriction check allows an action whose target it cannot find.** `restrictionTargetFor` returns null for a grant or an access request when the route passes no pre-fetched resource. A null target blocks nothing. Five mutating routes pass none, so a reviewer can approve a request on an archived collection (L1 T11).
- **Create actions never reach the restriction check.** They carry no resource id. Service guards stand in for the check, and those guards read only the row's own `is_archived`.
- **An unknown restriction type blocks nothing.** This one is deliberate, and `typeBlocks` documents it.
- **Some roles have no badge.** `RoleBadge` has no entry for the group role `RESOURCE_ACCESS`, so it renders the raw string. The collection role `MEMBER` exists, but no rule produces it. The second group search query has no fallback role, so a row can carry a null role and show no badge.
- **The slug route throws for every caller.** `GET /groups/slug/:slug` calls `authorizeAction` with `identifiers: { group_id }` instead of `{ user, resource }`. **Run 2026-09-14** against the development database: the call throws `AuthorizationError: User identifier is required`. `/groups/:id` is registered first, so the route is also unreachable (L3 T12).

### Operations: effects nobody decided

Each row is an operation, and each cell records what happens today to a related record.
"Untouched" is sometimes the right answer. The problem is that no document says which cells
are intended.

| Operation | Grants | Pending invitations | Open access requests | Other records |
|---|---|---|---|---|
| Archive a group | untouched, and reads continue | not cancelled; refused at accept | not closed, and still reviewable (L1 T11) | descendants keep `is_archived = false` |
| Archive a collection | untouched | none | not closed | contained datasets are not restricted |
| Remove a member | direct grants stay; group grants stop reaching them | invitations they sent stay usable | requests they filed for the group stay reviewable | none |
| Soft-delete a dataset | stay valid, because no policy reads `is_deleted` | none | not closed | `collection_dataset` rows stay open; no restriction is written |
| Soft-delete a user | kept | kept | kept | memberships stay open; the last-admin check still counts them |
| Delete a collection | deleted outright | none | cascade-deleted, including those under review, with no notice | `collection_dataset` history is cascade-deleted, contrary to decision 1 |
| Change owner through `PATCH /v2/datasets/:id` | the seeded grant still names the old group | none | not moved | unaudited (L1 T12) |

### Invariants held only by application code

- **At least one admin per group.** The check lives in the route, outside a transaction, and bulk removal bypasses it (L1 T13).
- **Access-request status transitions.** Each service method guards its own `updateMany`, and no table lists the allowed moves.
- **No duplicate in-flight request.** The service reads and then writes, with no lock.
- **`is_archived` matches the restriction table.** Transactions keep the two in step, and a test asserts it.

### Tests are mostly examples

There are about 905 API tests and 52 end-to-end scenarios, and nearly all are single named
examples. No test crosses roles with actions. `fast-check` is installed and used once, outside
the access layer.

The coverage tests are the strong exception, and they are the pattern to extend:

- `restrictions.test.js` classifies every action.
- `accessTypeClosure.test.js` checks the order.
- `route_policy_bindings.test.js` checks every route binding.

## Target shape

### The rule is a query

The rule lives in SQL, next to the data it reads. A list needs the rule as a filter the
database can run. A JavaScript function can only evaluate one resource at a time, so a list
would need a second copy of the rule in SQL. That second copy is where the agreement failures
above came from.

**Terms are SQL fragments.** Each term of the decision rule is one fragment over the views:
`admin`, `oversight`, `member`, and `grant`. The `grant` fragment takes the access types that
satisfy a requirement, already widened through the closure by `satisfiedBy`.

**A builder joins the fragments into one prepared statement.**
`accessPathsQuery(user_id, resource_type, { access_types })` unions the fragments. Each output
row is one path, with these columns:

| Column | Meaning |
|---|---|
| `resource_id` | the resource the path reaches |
| `path_kind` | one of `admin`, `oversight`, `member`, or `grant` |
| `group_id` | the group the path runs through, when there is one |
| `grant_id` | the grant, for a `grant` path |
| `collection_id` | the containing collection, when a grant arrived through one |
| `access_type` | the type the grant carries, for a `grant` path |

`createAccessibleDatasetIdsCte` in `services/datasets_v2/fetch.js` already has this shape. Its
three `scope` branches are three path kinds. It returns ids only, and so it discards which
branch produced each row. The builder generalises it to every resource type and keeps the path
columns.

**Every consumer reads that one statement.**

- **A list** joins on the statement and takes distinct `resource_id`. Its filters, sort, and pagination stay in the same query.
- **A single check** binds `resource_id` to one id. The action is allowed when any returned row satisfies it.
- **Standing** is the set of rows for one resource.
- **Capabilities** come from the same rows. One query fetches every path to the resource, and the action table decides all its actions from those rows without another query.

**The action table is data, not logic.** It says which path kinds each action accepts, and which
access type a `grant` path must satisfy. The list query and the capability computation both read
it. Neither restates a term, so a term cannot drift between them.

**Four inputs stay outside the statement.**

- **The platform admin** comes from the session's roles. It is checked once, before the statement runs, as it is today.
- **Restrictions** block only mutating actions. A mutation joins `effective_restriction` for its one target. Reads never consult restrictions, so lists do not join it.
- **Attribute filters** decide which fields a caller sees. They project the fetched row according to its paths, after the query.
- **Terms that name no resource** stay as hydrated policies in the engine. Two examples are `isRequester` on an access request and `isSubject` on a grant.

This changes how the builtin dataset, collection, and group policies evaluate. `core/` stays
framework code and keeps its hydrator path for the terms above.

The per-check cost is estimated at one query, against several hydration queries today. That
estimate is unmeasured, and Phase 4 measures it.

### Current state has one definition

The views are the single definition of "active": `active_group_user`, `valid_grants`,
`active_collection_dataset`, `effective_user_groups`, `effective_user_oversight_groups`, and
`effective_restriction`. Every fragment reads a view, never a base table with its own filter.
`coverage.js` re-implements the `grant` term today. It becomes a reader of `accessPathsQuery`.

A test scans `api/src` for `removed_at: null`, `revoked_at: null`, and `is_archived: false`. It
fails on any hit outside an allowlist of history readers. This follows the shape of
`platformAdminShortCircuit.test.js`, which fails when a policy names the platform-admin role.

### Paths replace the first-match role

The path rows replace `deriveCallerRole`. `_meta.standing` replaces `_meta.caller_role` and
carries the path rows for the resource. Every consumer of `caller_role` is a v2 page, so the
change stays inside v2.

The badge picks its text from standing through one precedence table. A test asserts that every
path kind has an entry.

The Access tab appears for every caller who can view the resource. A caller with
`manage_grants` sees the grant table. Every other caller sees `MyAccessTab`, which lists their
paths. That removes both `callerRole === 'GRANT_HOLDER'` gates, which is simpler than adding a
new capability.

### The persona goes

`uiPersona` exists only to choose dashboard sections, and it is a third definition of "admin".
`/v2/users/me` instead returns three facts from the views: whether the user is a platform
admin, how many groups they administer, and how many they oversee.

- The dashboard shows its governance section when either count is above zero.
- `pages/v2/groups/index.vue` reads the same facts instead of `auth.canAdmin`.
- `RequestSubjectSelector.vue` offers "A group I administer" when the admin count is above zero.

### The restriction check refuses when it cannot find a target

A mutating action on a grant or an access request with no resolvable target raises an error
that names the action. It no longer allows the action. Create actions resolve their target from
the owning group id, so an archived ancestor blocks them in the engine. The service-level
`is_archived` guards then become redundant, and they are removed.

A test enumerates every route binding for a mutating action and asserts that a target
resolves. This extends `route_policy_bindings.test.js`.

### Operation effects are a written table

Every cell of the operations table gets one of three decisions: cascade to the related record,
refuse the operation, or leave the record with a stated reason. The table moves into
[Design — Lifecycle Management](./design.md#lifecycle-management). Each cell becomes one
assertion in the operation sequences below.

## Verification harness

The harness has four parts: a reference model, worlds, comparison arms, and operation
sequences.

### Reference model

`api/tests/model/reference.js` implements the model section in plain JavaScript over in-memory
arrays. It never imports `src/authorization`, `src/services`, or Prisma. It is written from
[Design](./design.md), not from the code, so the engine and the reference are unlikely to share
a mistake. Its size is estimated at 200 to 300 lines. That figure is a guess, not a
measurement.

The reference model is JavaScript even though the production rule is SQL. Its job is to be an
independent oracle, and it never runs in production, so efficiency does not matter. A reference
written in SQL would read the same views as the production statement and repeat their mistakes.

`api/tests/model/actions.js` holds the action table: each action, the terms it accepts, and its
required type. A test asserts one row for each registered action, so a new action
fails until someone classifies it.

### Worlds

A **world** is a set of groups, users, resources, grants, and restrictions. The harness builds
each world twice, once in the database and once in the reference model.

For a pair of one user and one dataset, the dimensions and all their values are:

| Dimension | Values | Count |
|---|---|---|
| Platform admin | no; yes | 2 |
| Relation to the owning group | none; direct member; direct admin; member of a child group; admin of the parent; removed member; member whose `valid_until` passed | 7 |
| Grant subject | the user; a group the user belongs to; a group the user left; Authenticated Users; Public | 5 |
| Grant route | on the dataset; on a collection containing it; on a collection whose row was removed | 3 |
| Grant access type | the ten seeded types | 10 |
| Grant validity | active; revoked; superseded; expired; not yet started | 5 |
| Restriction | none; on the dataset; on a collection containing it; on the owning group; on the parent group | 5 |
| Dataset deleted | no; yes | 2 |

The full product is 105,000 pairs. Across 23 dataset actions that makes about 2.4 million
decisions. The reference model evaluates all of them in memory. The engine runs against the
database, so it cannot evaluate every cell at that scale. It runs on a reduced set:

- **All pairs.** Every pair of dimension values appears in at least one cell. The generator reports the actual cell count.
- **Sensitivity pairs.** For each dimension, the set includes two cells that differ only in that dimension and have different reference outcomes.

One database world holds many cells at once, because each cell is one user. Collections and
groups get the same treatment with fewer values. Groups add a hierarchy position dimension:
self, parent, child, sibling, or grandparent.

**The sensitivity check guards against a result the data forced.** A dimension with no
sensitivity pair is not being tested, even when every assertion passes. The generator fails in
that case.

**The coverage check guards against unhandled values.** It reads enum values from the Prisma
client, so a new value fails it. It covers:

- `GROUP_MEMBER_ROLE` and `SUBJECT_TYPE`
- `RESOURCE_TYPE`
- `GRANT_CREATION_TYPE` and `GRANT_REVOCATION_TYPE`
- `INVITATION_STATUS`
- `ACCESS_REQUEST_STATUS` and `ACCESS_REQUEST_ITEM_DECISION`
- every restriction type and every access type

The reference model also writes a decision table to
`docs/design/groups/generated/access-decisions.md`. It has one row per distinct standing and
action, not one row per cell, so a person can read it. `npm run model:table -- --check` runs
in CI.

### Comparison arms

Each arm reads one consumer and compares it with the reference for every user, action, and
resource in a world.

| Arm | What it reads | Compared with |
|---|---|---|
| Engine | `authorizeAction` with identifiers only, so hydrators and virtual attributes run | reference `allowed` |
| Route | one read and one mutation per resource type, through the real router | the engine arm |
| Capabilities | `_meta.capabilities` from each detail route | reference `allowed` for each action |
| Lists | dataset list, collection search, group search, expiring grants, and the review queue | reference decision for the action each list declares |
| Standing | `_meta.standing` | reference paths |
| Attributes | the field set from `permission.filter(resource)` | reference attribute set for the paths |

A list and a page agree by construction once both read `accessPathsQuery`. The list arm then
checks that the statement matches the reference. It keeps one cheap assertion that the list and
the page still share the statement.

Non-admin users carry the weight of every arm. A platform admin bypasses every policy, so an
admin-only run proves nothing about a policy path.

The output is a report of disagreements grouped by arm and by dimension, not a bare pass or
fail. Each disagreement is either a code bug or a gap in the specification. Gaps go to
[Decisions](./decisions.md).

**Known disagreements to confirm.** The first run should find these four:

- the group role precedence
- the group search leaving out resource access
- expiring grants for overseers
- an archived ancestor on create

If the harness misses any of them, the harness is wrong.

### Operation sequences

`fast-check` model-based testing (`fc.commands`) drives random sequences of operations. The
same commands run against the real service layer and the reference model.

The commands cover:

- **Membership:** add a member, remove a member, promote, demote.
- **Groups:** create a child group, archive a group, unarchive a group.
- **Collections:** archive, unarchive, and delete a collection; add or remove a dataset.
- **Grants:** issue a grant, revoke a grant.
- **Requests:** create and submit, review, withdraw.
- **Invitations:** invite, accept, cancel.
- **Deletion:** soft-delete a dataset, soft-delete a user.

After each command, three checks run:

1. **Invariants.** Every invariant the model page states holds.
2. **Agreement.** The engine matches the reference on `view_metadata` and one mutation for every pair of user and resource.
3. **Effects.** The operations-table cell for that command holds.

Each run is seeded, and the seed is printed on failure. `fast-check` shrinks a failing sequence
to a minimal one. The starting budget is 200 sequences of 25 commands. That budget is a
starting guess, not a derived figure, and Phase 6 adjusts it from measured run time.

Sequential commands do not find races. The existing concurrency suites cover races. The
last-admin rule and the no-duplicate rule need database constraints, which no sequential test
can prove.

**Prerequisite: an isolated test database.** The API suites share the development database
today, and full runs fail intermittently because of it (see `.todo/local/misc-carryover.md`).
The harness writes many rows per run, so it needs its own database.

### The UI layer

The browser does not get a matrix. Once standing and capabilities agree at the API, the UI risk
is only the mapping. Three checks cover it:

- Every path kind has a badge entry.
- Every name passed to `can()` in a `.vue` file is a registered action, checked by a static scan.
- No v2 gate compares a role, a persona, or `user_role` to a literal, with an allowlist for display-only text.

One Playwright pass renders one resource for each standing.

## Phases

Each phase ends with an exit criterion that a test or a count can check.

### Phase 0: close the live holes

L1 T11, T12, and T13 are live today and do not need the harness.

- The fix for T11 is the target-shape change to the restriction check, so this phase builds that part.
- T12 whitelists the fields `PATCH /v2/datasets/:id` accepts.
- T13 moves the last-admin check into the removal transaction.
- The legacy `PATCH /datasets/:id` passes its body through the same way. It is v1, so it is recorded in [v2 cut-over](../v2-cutover.md) and not changed.

**Exit:** one refusal test per item fails before the fix and passes after it.

### Phase 1: write the model page

A new page, `access-model.md`, holds the base relations, the derived relations, the decision
rule, paths, time, and the operations table with a decision in every cell. The open decisions
below are answered with the owner, and each answer goes to [Decisions](./decisions.md).

**Exit:** no operations-table cell is undecided, and every open decision is answered or
explicitly deferred.

### Phase 2: reference model, worlds, and the table

The isolated test database comes first. This phase then builds:

- the reference model and the action table
- the world generator
- the coverage and sensitivity checks
- the generated decision table with its `--check` mode

**Exit:** the coverage check passes for every enum and every registered action. The sensitivity check
passes for every dimension. The generator reports the engine-arm cell count and its run time.

### Phase 3: static agreement

Every comparison arm runs, and every disagreement is classified. Bugs get fixed. Gaps in the
specification go to Decisions.

**Exit:** no disagreement is unclassified. Each fixed bug has a harness cell that failed before
the fix. The four known disagreements were found.

### Phase 4: the rule becomes a query

This phase builds `accessPathsQuery` for datasets, collections, and groups, starting from
`createAccessibleDatasetIdsCte`. It then moves each consumer onto that statement:

- the dataset list, collection search, group search, expiring grants, and `viewableDatasetIds`
- the single checks for the builtin dataset, collection, and group policies
- `coverage.js`

It deletes the duplicate helpers and `explainDatasetAccess`, and adds the base-table scan test.

**Exit:**

- No list query or builtin policy restates a term.
- The scan test passes with only history readers on its allowlist.
- The harness stays green.
- The median query count and latency of a detail-page check are measured before and after the change.

### Phase 5: paths and standing

This phase builds everything the target shape describes for paths and standing:

- Capabilities and `_meta.standing` come from the path rows, and `_meta.standing` replaces `_meta.caller_role`.
- The badge reads standing.
- The Access tab appears for every viewer.
- The persona gives way to the three facts from `/v2/users/me`.
- The UI scans run in CI.

**Exit:** the standing arm is green, and no v2 gate reads a role literal.

### Phase 6: operations

This phase implements the effects decided in Phase 1 and builds the operation-sequence suite.

**Exit:**

- The seeded budget runs clean.
- Every operations-table cell has an assertion.
- Reverting one decided effect by hand makes the suite fail. That proves the suite can see the effect.

### Phase 7: keep it true

The v2 page patterns gain a checklist item. A new enum value, action, operation, or restriction
type extends the model page, the reference model, and the action table. The tests from Phases 2
and 5 enforce this. The `authorization-engine` and `api-tests` skills record what the harness
taught.

**Exit:** adding a throwaway enum value in a scratch branch fails the coverage check.

## Decisions the model forces

Each question needs an answer before Phase 1 ends. Each one states today's behaviour, read from
the code.

1. **Removal and direct grants.** A user is removed from the owning group but holds a direct grant. Does the grant stay? Today it stays.
2. **Archiving a group.** Should pending invitations be cancelled and open requests closed at archive time? Today invitations are refused only at acceptance, and requests stay reviewable.
3. **Archiving a collection.** Does archiving a collection restrict its datasets? Today it does not.
4. **Soft-deleted datasets.** Do grants on a soft-deleted dataset still confer access? Does it still appear in lists? Today grants still confer access, and lists exclude it only when the client asks.
5. **Soft-deleted users.** Do a soft-deleted user's memberships close and their grants end? Today nothing changes.
6. **Deleting a collection.** Should deletion cascade-delete requests and history, or close them? Today it cascade-deletes, contrary to decision 1.
7. **An admin who leaves.** An admin leaves a group while a request they filed for it is under review. Is that request still reviewable? Today it is.
8. **Public grants and group visibility.** Reading `helpers.js` suggests that a grant to Public on any resource makes its owning group's page visible to every signed-in user. Is that intended? This is unverified and must be run first.
9. **Archived ancestors and new datasets.** May a child of an archived group own new datasets? The design says a restriction reaches descendants, but the service allows it.
10. **Zero admins.** `createGroup` accepts a root group with no admins. Is zero admins an allowed state?
11. **The seeded grant on an ownership change.** Does the seeded grant move with the dataset? This matters only once ownership transfer exists. L1 T12 closes the accidental path.

## Out of scope

- **v1 routes.** They retire at cut-over, as [v2 cut-over](../v2-cutover.md) describes.
- **Races.** The concurrency suites own them, and database constraints enforce the two rules above.
- **The cost of the view queries.** Performance is measured separately if Phase 4 slows a list.
- **Bounded model checkers such as Alloy or TLA+.** They earn their cost when the hierarchy changes during its lifetime. Reparenting or delegated authority would be that trigger.

## How this is settled

The work is done when all of these hold:

- The model page has a decision in every cell.
- The generated table passes `--check` in CI.
- The engine, capabilities, lists, and standing agree with the reference model on every world cell.
- The seeded operation sequences run clean.
- A new enum value or action fails a test until someone handles it.

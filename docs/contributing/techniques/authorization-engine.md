---
title: Authorization engine techniques
---

# Authorization engine techniques

This page explains how `api/src/authorization/` and `api/src/state/` behave in practice. It holds
the background behind the traps in the `authorization-engine` skill
(`.claude/skills/authorization-engine/SKILL.md`). Two other pages hold the rest:

- [api/src/authorization/README.md](https://github.com/IUSCA/bioloop/blob/main/api/src/authorization/README.md) describes the layers,
  `index.js`, policies, containers, hydrators, and paths.
- [Access model](../../design/groups/access-model.md) states the decision rule, the state check,
  paths and standing, the badge vocabulary, projection, and refusal shapes.

This page does not repeat either one.

## Policies

### No policy names the platform-admin role

The pipeline allows a platform admin before any action policy runs. A policy therefore never
carries an `isPlatformAdmin` term. A per-policy term would mean the same thing everywhere, and a
route whose author forgot it would have a hole rather than a stricter rule.

An action nobody qualifies for on their own uses `platformAdminOnly` from
`builtin/policies/utils/index.js`. It always evaluates to false. It says in one word what an empty
`Policy.or([])` leaves a reader guessing about. `tests/authorization/platformAdminShortCircuit.test.js`
fails when a policy names the role.

### Platform admin reads `current_roles`

Routes seed the JWT profile into `req.policyContext.cache.user` and pass it as `preFetched.user`.
That profile carries the roles the user held at login. `isPlatformAdmin` requires `current_roles`
instead. It is a virtual attribute on the user hydrator, and no profile carries it, so it is
always read from `user_role`. `tests/authorization/platformAdminFromDatabase.test.js` pins both
directions.

A route that branches on platform admin calls `callerIsPlatformAdmin(req)` from `@/authorization`.
`auth.isPlatformAdmin(req)` in `services/auth.js` reads the session, so a v2 route never uses it.

### Terms read `access_paths`

The dataset, collection, and group terms decide from one context attribute, `access_paths`.
`loadAccessPaths` in `builtin/paths/index.js` runs `accessPathsQuery` bound to one resource. It
returns `{ rows, kinds, access_types }`, with the grant types widened. A term is a set test, such
as `context.access_paths.kinds.has('admin')`.

Each path-based type has its own SQL file, `builtin/paths/<type>.js`. It exports
`{ resourceType, sql, prospectiveKinds }`, and `authorization/index.js` registers it with
`pathRegistry.register(...)`. A type whose terms never read `access_paths` registers nothing.

A create has no resource id. `contextIdentifiers` in `core/hydrationUtils.js` passes the
pre-fetched resource as `prospective`. The loader then reads the owning group's rows, limited to
the type's `prospectiveKinds`. The context cache key includes the prospective resource, because the
batch create route checks several owning groups in one request.

`findAsyncTerms` runs at boot. An `evaluate` declared `async` fails startup, because it reads the
database behind its `requires`. The read belongs in a hydrator virtual attribute, as
`resource_owner_group_id` on the grant hydrator shows.

`api/tests/model/measureDetailCheck.js` counts queries per detail check in the covering world. On
63 checks, one run each, the median check took 3 queries and the maximum took 5.

### Leaf terms carry `meta`

Every leaf term carries `meta`. A path term has `{ pathKind }`, and a grant term adds
`accessType`. `always`, `never`, and `platform_admin_only` have `{ pathKind: null, rule }`.
`Policy.or`, `and`, and `not` keep `operator` and `children`, and `policy.terms()` lists the unique
leaves. The tables under `builtin/tables` and the reference model under `api/tests/model` read only
these. A new term with no `meta` fails `registryCompleteness.test.js`.

### Restriction classes

A container's `.actions({...})` takes `mutating(policy)`, `reading(policy)`, or
`readingData(policy)` from `core/policies/PolicyContainer.js`. `getRestrictionClass(action)` reads
the class back, and its values are `mutating`, `reading`, and `data`. `registryCompleteness.test.js`
fails on an action with no class.

The classes matter even though no restriction is in force. `core/capabilities.js` selects the
non-mutating actions by class. `tests/model/badgeCoverage.test.js` and `standingArm.test.js` key off
it. The reference model's `stateAdmits` derives its answer from the class rather than from the state
rules. That keeps the oracle independent of the code it checks.

`access_request` has separate `submit` and `withdraw` actions, and the routes authorize those rather
than `update`. Each carries a transition row naming the states it moves between.

### Reading a container

`PolicyContainer` exposes `getActionNames()`, `getPolicy(action)`, `getAttributeRules(action)`, and
`export()`. Registration renames each policy to `<resourceType>.<action>`. A composed policy's name
carries the names of its parts. So `JSON.stringify(container.export())` is enough to assert that a
term is absent.

Registering a container takes two lines in `authorization/index.js`. The `require` goes in SECTION 2
and `policyRegistry.register(...)` goes in SECTION 4. The list helpers live in `builtin/lists.js`,
built by `createListHelpers` with the pipeline. A resource-free action, such as
`audit.read_records`, is guarded with `authorize('audit', 'read_records', { resourceIdFn: () => null })`.

## The pipeline

### One pipeline decides for the middleware and for `authorizeAction`

`createDecisionPipeline` in `core/pipeline.js` is the only decision path. The middleware in
`core/middlewares.js` builds one. `authorization/index.js` builds another from the same arguments,
and `authorizeAction` is that second one. The order is the restriction checker, then the
platform-admin policy, then the action's policy.

Capabilities are every action for a platform admin and `evaluateCapabilitySet` for anyone else.
Both branches pass through `filterRestrictedCapabilities`, so a caller of `authorizeAction` does not
filter them again. Neither branch reads the resource's state.

### Refusal status

A refusal carries `status`. `concealRefusalsWithoutStanding` lists the types whose refusals are
concealed, and the application passes `pathRegistry.listTypes()`. Any other container answers 403,
because its id may name another type's resource. For example, the grant listing authorizes `grant`
on a dataset id. A member of the owning group holds no grant-container term there, and concealing
would answer them 404.

A route that decides in its handler answers with `decision.status` rather than a literal 403.
`refusalMessage(permission)` gives the text. A caller refused `view_metadata` still gets `standing`
when the call asked for it, because a public-profile reader stands on a group they cannot open.
The status table itself is in [Refusal shapes](../../design/groups/access-model.md#refusal-shapes).

### The restriction seam

`checkRestriction` in `builtin/restrictions.js` returns `null` for every action. Archiving and
deletion are resource state, answered by `src/state` from the services. No restriction type is
specified, so nothing blocks. The seam stays live: the engine calls the checker before any policy,
and an application can inject one that blocks.

`tests/authorization/restrictionSeam.test.js` injects a checker that blocks one dataset action. It
asserts the three places a restriction acts. The decision carries `blockedBy`. The capability map
turns the action to `false` rather than dropping the key. `filterRestrictedCapabilities` does the
same over a list row. The test also asserts the builtin checker blocks none of the registered
actions.

### An empty attribute rule set denies every attribute

`createFilterFunction([])` returns `() => ({})`. So `authorizeWithFilters` with `attributeRules: []`
grants the action and returns an object with no fields. That looks like a hydration failure rather
than a filter decision. A registered container cannot reach this, because `PolicyContainer.freeze()`
refuses an action with no rule of its own and no `'*'` rule. A code path that should return
everything passes an explicit rule, as the pipeline's `ALL_ATTRIBUTES` does:

```js
attributeRules: [{ policy: Policy.always, attribute_filters: ['*'] }]
```

### Attribute rules combine by union

`evaluateAttributeFilters` returns the field list of every rule whose policy matches.
`createFilterFunction` merges the projections by key. Rule order decides nothing. Do not add a
short-circuit to save evaluation, because every builtin term reads `access_paths`, which is already
cached for the resource. `tests/authorization/attributeRuleOrdering.test.js` checks that a caller
matching any two rules sees every key either shows.

Assert what a caller sees by running the decision, not by reading the rule list.
`tests/services/grants/grantHolderAttributes.test.js` grants each access type and checks what
`authorizeAction(...).filter(dataset)` returns.

`projectObject` copies plain objects and arrays. It leaves `Date`, `BigInt`, and `Decimal` values as
they are, and a projection never shares a nested object with the source row. The tests under
"shapes the path does not expect" in `src/utils/expression/index.test.js` generate trees with
`null`, primitives, arrays, and `Date`s. Extend those when projection changes, because a generator
whose trees match every path cannot find a shape bug.

### Configuration is checked when the module loads

A mistake in a policy, an attribute rule, a hydrator, a paths file, or a route's action name fails
startup. Each check lives where the thing is declared. `tests/authorization/bootValidation.test.js`
pins each one.

- `PolicyContainer.attributes()` parses every attribute path with `compileProjection`. It refuses a
  malformed one such as `owner..name` or `items[0].id`. `base_attributes.js` compiles its lists at
  load, because routes project with them outside any rule.
- `PolicyContainer.freeze()` refuses rules keyed by an undeclared action. It also refuses an action
  with no rule of its own and no `'*'` rule.
- `PathRegistry.register` checks `resourceType`, `sql`, and `prospectiveKinds`.
  `pathRegistry.assertValid(policyRegistry)` refuses paths for a type with no container.
- `assertRegistriesValid` runs `findUnhydratableRequirements`. It lists each term, attribute rule,
  and transition whose requirement no hydrator can supply.
- `createDecisionPipeline` checks both registries, the injected functions, and the concealed types.
  It resolves the `user`, `context`, and every action's resource hydrator.
- `require('@/authorization').import(type)` binds `.action(name)`, `.rows(name)`, `.listFilter()`,
  and `.standingOfRows()`. Each checks the type, the action, or the paths at module load. The
  workflow routes bind every action in `workflow_policy_actions`. The string forms such as
  `authorizeAction(type, action)` remain for tests.

Per call, the engine checks only the request's own values. Those are `identifiers.user`, an id
needed to fetch, the attributes a hydrated entity carries, and unknown attribute names a service
passes a hydrator directly. The middleware unit tests use real registries, because the pipeline
refuses mocks when it is built.

## Hydrators

### Requirements no hydrator can supply

A policy's `requires.resource` names attributes the hydrator must supply. When one is neither a
column nor a registered virtual attribute, hydration throws
`HydrationError: [<model>] Unknown attributes: <name>`. The boot check above catches a name that
does not resolve. `tests/authorization/hydrateEveryAttribute.test.js` hydrates every declared
attribute against a seeded row, so a loader that throws fails there.

The fix is a virtual attribute on the model's hydrator. For example, `grant.resource_type` is not a
column, so `builtin/hydrators/grant.js` resolves it from the `resource` row. A model with no entry in
`hydratorRegistry` gets `createDefaultHydrator`, which has no virtual attributes. Adding a policy
requirement to such a model is where this bites.

`tests/authorization/grantHydrator.test.js` shows the call shape: `hydrator.hydrate({ id, attributes })`
takes an object, not positional arguments.

### When a virtual attribute actually runs

`authorizeWithFilters` prefers `preFetched` over hydrating. The auth middleware pre-fetches
`req.user`, and routes such as `authorize('grant', 'create', { preFetchedResourceFn })` supply the
resource. So a virtual attribute runs only when something calls the engine without pre-fetching
that entity. A test that changes a hydrator calls `authorizeAction` with only `identifiers`.

A platform admin never reaches the hydrator either, because the pipeline allows them before any
policy runs. A browser pass as `test_user` therefore proves nothing about a policy path. Sign in as
a group admin such as `user-054`.

### The cache

The resource cache is one `Map` shared by every resource type in a request.
`PrismaHydrator.cacheKey(model, id)` returns `<model>:<id>`. Code that seeds a cache calls it, as
`core/middlewares.js` and `middleware/auth.js` do for the user. A bare id is a silent miss.

`PrismaHydrator.hydrate` writes into the cached record. It assigns the id when a policy needs no
columns, and it `Object.assign`s the fetched row when it does. So an object seeded into
`req.policyContext.cache.user` must be mutable. A frozen object fails with
`TypeError: Cannot assign to read only property 'subject_id'` on every request.
`ANONYMOUS_PRINCIPAL` is frozen on purpose, so `optionalAuthenticate` puts a shallow copy in the
cache and leaves `req.user` pointing at the original. `preFetched` has no such problem, because
`hydrate` copies it first.

A record with no id is never cached. A create decision has `identifiers.resource === null` and
names its owning group in `preFetched.resource`. The hydrator builds that record for the call
alone, so two creates in one request never share facts. `tests/authorization/nullIdHydration.test.js`
pins it. Any loop that decides several creates through one `req.policyContext` depends on it.

### Rows from the extended Prisma client

`api/src/db.js` extends the client with computed result fields: `grant.expiry`, `grant.is_active`,
and `access_request_item.requested_expiry` and `approved_expiry`. `structuredClone` throws
`DataCloneError` on objects carrying them. `PrismaHydrator` copies pre-fetched attributes and
fetched records with `copyTree` from `utils/expression` instead. When a clone fails elsewhere, walk
the object's own properties and check `util.types.isProxy`. The item inside a row is often the
wrapped object, not the row. `tests/authorization/hydrateExtendedRows.test.js` pins it.

## Lists

### Public attributes on a list, more on the detail route

The rule is stated in [Projection](../../design/groups/access-model.md#projection). These are the
code-level facts behind it.

- Collection, group, dataset, and grant each have a `list` action of `reading(Policy.always)`. A
  `list` action also needs a `list: always` state rule, or the startup sync check throws.
- The group rule adds `depth`, the row's place in a search or a lineage.
- `tests/authorization/listFilter.test.js` pins that an owning-group admin sees only public fields
  on a list row.
- `standingOfRows` reads `_meta.standing` from one `accessPathsByResource` statement for the page.
  It maps each row's paths with `standingFromPathRows`, so it matches the detail route without
  evaluating a policy.
- `decideRows` gives each row `_meta.capabilities` and `_meta.standing` with the detail route's
  composition. It reads the page's paths once with `accessPathsByResource`, then seeds each row's
  check. `tests/model/listRowsArm.test.js` compares it against the single-row composition.
- No search list sends `_meta.available_actions`. The access-request, grant, and invitation lists
  build it from `availableActions` over fields their own queries fetch.

### A list query widens through the access-type order

A page decides with `userHasGrant`, which reads a set already closed over the access-type order. A
list query filters grant rows in SQL, where `gat.name IN (...)` matches a literal type. Matching the
page's type literally hides rows the page would open. Passing no type filter lists rows the page
then refuses with 403.

The query takes `grantService.satisfiedBy([...])` of the page's type, as `datasets_v2/fetch.js` and
`collections.js` do. `accessPathsQuery` throws on an empty type list.
`tests/services/grants/listVisibility.test.js` is the parity harness. Add a case when a new grant
shape appears.

A grant on a collection may carry dataset access types, and those count for the datasets in it. A
collection access type never counts for a dataset. The collection Datasets tab reads
`GET /collections/:id/datasets`, which lists every dataset with `_meta.capabilities` from
`decideRows`. A row without `view_metadata` does not open, so browsing and opening differ row by row.

## Standing

`deriveStanding` collects every term with `meta.pathKind` from the container's reading actions. It
expands each held term through `expandPath` in `builtin/paths/standing.js`. A platform admin's
standing starts with `platform_admin` and lists every other path too.

A dataset never has a `member` path in standing. Its only member term serves `contribute`, which is
mutating. The standing arm's coverage list says so.

The badge is a display function in `ui/src/services/v2/standing.js`. `badgeFor` walks
`BADGE_PRECEDENCE`, and `rowBadgeFor` drops `platform_admin` on list rows.
`tests/model/badgeCoverage.test.js` reads that UI file as text and checks every standing kind has a
row. The vocabulary is in [The badge vocabulary](../../design/groups/access-model.md#the-badge-vocabulary).

Membership of the owning group confers no read. Creating a dataset or a collection writes a grant to
the owning group with `creation_type` `SYSTEM_BOOTSTRAP`. It carries `DATASET:LIST_FILES` or
`COLLECTION:LIST_CONTENTS`, each of which satisfies its `VIEW_METADATA` counterpart through the
access-type closure. See decision 12 in [decisions.md](../../design/groups/decisions.md).

## Capabilities and state

`_meta.capabilities` says what the caller could do. `_meta.available_actions` says what the
resource's state admits, from `availableActionsOf` over the rules in `src/state/builtin/`. A
reviewer therefore holds `review` on a decided request, and the request's state withholds it.
`tests/model/transitionsArm.test.js` checks every request status for the requester, the group admin,
and a platform admin.

- `request_access` is not an action. `mayFileRequest` in `services/access_requests/request.js`
  decides it. The dataset and collection detail routes append it through `extraCapabilities`.
- Group and collection `archive` and `unarchive` are withheld by state rules, not by the capability
  map. A platform admin holds both capabilities in every state.
- `authorization/` holds the decision engine only. Code that writes records, such as the audit
  writer in `services/audit/`, lives in `services/`. `authorization/index.js` does not import
  `src/state`.
- A detail route builds `_meta` with `buildMeta(type, row, permission)` from `src/services/meta.js`.

## The state layer

The rule is stated in [The state check](../../design/groups/access-model.md#the-state-check).
`src/state/` is split like `authorization/`: `core/`, `builtin/` with one file per resource type,
and `custom/`.

- **A rule is pure, and the caller fetches.** `requires` names the field paths a rule reads, such
  as `owner_group.is_archived`. A service reads the row inside its transaction after its row lock
  and calls `assertPossible`, which throws 409. A list fetches the fields once for the page and
  calls `availableActions` per row. `requiredFields` gives the union to select.
- **A missing field is an error.** `check` throws naming the path, so a caller that selected too
  little fails loudly.
- **A container declares a `select` fragment.** `withStateFieldsOf(type, { where, include })`
  merges it into the caller's own query. Under `select` the whole fragment merges. Under `include`
  only its relations merge, because Prisma rejects a column named in `include`. The caller's key
  wins a clash. Every type but `user` and `audit` declares a fragment, and `selectOf` throws on
  those two.
- **A raw `FOR UPDATE` cannot take a fragment.** Lock with `SELECT id ... FOR UPDATE`, then read
  with the fragment, as `lockCollection` and `lockGroup` do.
- **Bind the layer to one type.** `require('@/state').import('collection')` gives `assertPossible`,
  `availableActions`, `forbiddenActions`, `requiredFields`, `select`, and `withStateFields`. The
  unbound exports carry an `Of` suffix and take the type first. `import` throws at require time for
  a type with no state container.
- **Grants and access requests are given the raw row.** Their fragments fetch `resource` with
  `TARGET_SELECT` and `subject` with `SUBJECT_SELECT`. The container's `shape` turns those into the
  `target` and `subject` the rules read. A list whose rows lack `owner_group` fetches the resources
  once more with the fragment. Named examples are already in the rules' form, so a test of what an
  archived example forbids uses `forbiddenActionsOf`, never `check`. `tests/state/rows.js` builds
  raw rows.
- **The two layers are kept in step at startup.** `findStateGaps` reports a policy container with no
  state file, an action with no rule, and a rule naming no action. An action no state limits
  declares `always`. A resource with no policy container, such as an invitation, declares
  `standalone: true`.

`tests/state/rules.test.js` drives every rule with no database, and `tests/state/sync.test.js` pins
the startup check.

### A deleted dataset

`state/builtin/dataset.js` reads `is_deleted` directly. A deleted dataset refuses every change and
every data-plane action, and still admits reading its record. A service that writes locks the row
with `lockDataset` in `datasets_v2/index.js`. A read-only caller in `files.js` uses `findDatasetRow`.
Both merge the dataset fragment.

A dataset has no archive or unarchive. `route_policy_bindings.test.js` asserts both action names are
absent from the dataset container, so the archive pairing test cannot start applying to it.

### Adding a state check to a service

- **A list passes its rows.** `bulkStage` takes dataset rows and calls `check` on each one. A lookup
  inside the loop makes a pure decision depend on the database. The caller widens its own query
  instead, as the collection stage route does with `includes: { owner_group: true }`.
- **The state check runs before the service's own validation.** A validation query keeps only what
  it alone decides, such as unknown, deleted, or foreign datasets in `addDatasets`. A predicate the
  state rule already covers is a duplicate to delete.
- **A dataset is addressed two ways, and the name says which.** `dataset_row_id` is the integer
  `dataset.id`. `dataset_resource_id` is the UUID `dataset.resource_id`, and route parameters use
  it too. A bare `dataset_id` appears only as a column key, because the columns disagree:
  `dataset_file.dataset_id` is an integer and `collection_dataset.dataset_id` is a UUID. The
  generic authorization engine keeps `resource`, `resourceIds`, and `resource_id`. `lockDataset`
  takes `dataset_row_id`. `findDatasetRow` takes `resource_id` and returns the row with the state
  fields. A wrong id fails as a validation error, not a type error.
- **Most of these services return nothing.** `addGroupMembers` and similar functions return what
  their `$transaction` callback returns, often `undefined`. Assert on the row instead.

## Relations named for current state read the views

`group.members`, `collection.datasets`, and `dataset.collections` are Prisma relations to the view
models `active_group_user` and `active_collection_dataset`. The base-table relations are
`group.membership_history`, `collection.dataset_history`, and `dataset.collection_history`. An
include, a filter, or a `_count` through the plain name returns only open rows.

- Prisma cannot `orderBy` a relation count through a view relation. It fails with
  `Unknown argument _count`, so `searchAllCollections` ranks in memory.
- A view model has no create or update, including a nested write.
  `collection.create({ data: { datasets: { create: [...] } } })` fails with `Unknown argument create`.
  Write through `dataset_history`.
- `tests/authorization/currentStateScan.test.js` fails on `removed_at: null`, `revoked_at: null`, or
  `is_archived: false` in `api/src` outside its allowlist. An allowlist entry that stops matching
  fails as stale.

## Grants pin their resource

`grant.resource` is `onDelete: Restrict`. Every dataset and collection carries at least the owning
group's seeded grant. A collection is never deleted by a service, and datasets are soft-deleted. So
this arises only in test teardown. `deleteCollection` and `deleteDataset` in
`tests/services/helpers.js` remove grants first.

## A new container fails the suite until it is placed

Three checks read `policyRegistry.listTypes()`.

- `registryCompleteness.test.js` fails on an action declared as a bare policy, with no restriction
  class.
- `modelCoverage.test.js` fails on a type that is neither in `MODELLED_RESOURCE_TYPES`, exported by
  `tests/model/reference.js`, nor in its `NOT_MODELLED` map with the path of the test that decides
  it. `reference.decide` throws on any other type.
- `modelCoverage.test.js` also fails on an enum value no world reaches and no entry declares unread.
  It reads `@prisma/client`, so a schema edit counts only after `prisma generate`.

## The comparison arms

`api/tests/model` holds the reference model, the world generator, and the arms.

- `node tests/model/runEngineArm.js [report.json]` writes the covering world into `app_test`. It
  runs the Engine arm, prints disagreements grouped by action, and removes the world. The hydrators
  log every query, so filter with `grep -E "^wrote world|^engine arm:|^\[[0-9]+\]|^  shared:"`.
- `engineArm.test.js` runs the Engine and Creates arms. A new disagreement fails as unclassified. A
  `CLASSIFIED` entry needs the decision that settles it. A classification that stops matching fails
  as stale.
- `pathsArm.test.js` compares `accessPathsQuery` with the reference's `termPaths`.
  `listsArm.test.js` compares the dataset, collection, and group searches for `view_metadata`.
- `dbWorld.js` writes rows directly. `group_closure` has no trigger, so it writes the self row and
  every ancestor row itself.

## Probing the engine from a script

A one-off script can call the shipped engine against the development database. It runs from inside
`api/`, because `module-alias` reads `api/package.json`.

```js
require('module-alias/register');
const prisma = require('@/db');
const { authorizeAction, policyRegistry } = require('@/authorization');
```

Write the script in the scratchpad, copy it into `api/`, run it with `node`, and delete it. macOS
has no `timeout` command, so use the tool timeout. `policyRegistry.get(type).getActionNames()` lists
the registered actions.

`authorizeAction` expects `identifiers: { user, resource }`. Passing `{ group_id }` throws
`[policy:isPlatformAdmin] User identifier is required to evaluate policy`.

Check a list change against the live API per persona. Call the list, then the detail route for every
row it returns, and expect no 403.

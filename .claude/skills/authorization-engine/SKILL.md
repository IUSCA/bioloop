---
name: authorization-engine
description: How the ABAC engine in api/src/authorization evaluates a request, and the traps that cost a session
---

# The authorization engine

`api/src/authorization/` is split three ways. `core/` is framework code that knows nothing
about this application. `builtin/` holds the policies, hydrators, and restriction layer that
are specific to Bioloop. `custom/` is for derived apps.

Anything application-specific that `core/` needs is **injected**, never imported. The
restriction checker and the platform-admin policy both arrive as arguments to
`createAuthorizationMiddlewareFunction`. Follow that pattern rather than adding a `require`
to a file under `core/`.

## The order a request is decided in

1. **Restriction check.** `allowed = no restriction blocks this AND some grant permits it`.
   Runs first because it is cheaper and because the refusal can name what blocked it.
2. **Platform-admin short-circuit.** If the caller is a platform admin, every action is
   allowed and the action's own policy is never consulted.
3. **The action policy**, through `authorizeWithFilters`.

Step 2 sits after step 1 on purpose. An archived group is archived for a platform admin too.
Moving the short-circuit earlier would silently undo the restriction layer.

## No policy may name the platform-admin role

Action policies do not carry an `isPlatformAdmin` term. There were 77 of them and they all
meant the same thing, so a route whose author forgot one had a hole rather than a stricter
rule. `GET /audit/records` was that hole.

For an action nobody qualifies for on their own, use `platformAdminOnly` from
`builtin/policies/utils/index.js`. It evaluates to false always, and it says in one word what
an empty `Policy.or([])` would leave a reader guessing about.
`tests/authorization/platformAdminShortCircuit.test.js` fails if a policy names the role again.

## An empty attribute rule set denies every attribute

`createFilterFunction([])` returns `() => ({})`. So calling `authorizeWithFilters` with
`attributeRules: []` grants the action and then hands back an object with no fields, which
looks like a hydration failure rather than a filter decision. A registered container cannot
reach this: `PolicyContainer.freeze()` refuses an action with no rule of its own and no `'*'`
rule.

When a code path should return everything, pass an explicit rule:

```js
attributeRules: [{ policy: Policy.always, attribute_filters: ['*'] }]
```

This is what the platform-admin short-circuit does. Getting it wrong produced a passing
`granted: true` with an empty payload.

## Virtual attributes are dead code on the route path

`userHydrator.registerVirtualAttribute('roles', ...)` queried `user_role` through a relation
named `user`, but the schema calls it `users`. Every call threw, and nothing noticed for
months, because the auth middleware pre-fetches `req.user` with its roles already attached
and `authorizeWithFilters` prefers `preFetched` over hydrating.

So a virtual attribute is only exercised when something calls the engine **without**
pre-fetching that entity. `authorizeAction` from a service or a test is the usual way in.
When changing a hydrator, write the test that calls `authorizeAction` with only
`identifiers`, or the change is untested.

## Whatever you put in the user cache must be mutable

`PrismaHydrator.hydrate` writes into the cached record: it assigns
`recordCache[idAttribute] = id` when a policy needs no columns, and `Object.assign`s the
row when it does. So the object a caller seeds into `req.policyContext.cache.user` is
written to, not just read.

Seeding a frozen object there fails with
`TypeError: Cannot assign to read only property 'subject_id'`, from inside `hydrate`, on
every request. Nothing catches it before the 500.

This bites the anonymous principal specifically. `ANONYMOUS_PRINCIPAL` is frozen on
purpose — it is shared by every unauthenticated request and nothing should mutate it — so
`optionalAuthenticate` puts a shallow copy in the cache and leaves `req.user` pointing at
the frozen original.

`preFetched` has no such problem: `hydrate` runs `structuredClone` over it first, and a
clone is never frozen. So the failure appears only when something seeds the cache directly.
`initializePolicyContext` does exactly that, which is why the shape is worth knowing, and
it never bit before because a JWT profile is an ordinary mutable object.

## Reading a policy container

`PolicyContainer` exposes `getActionNames()`, `getPolicy(action)`, `getAttributeRules(action)`,
and `export()`. Policies are renamed on registration to `<resourceType>.<action>`, and a
composed policy's name carries the names of its parts, so `JSON.stringify(container.export())`
is enough to assert that a term is absent without reaching inside the combinators.

Registering a container takes two lines in `authorization/index.js`: the `require` in section
2 and a `policyRegistry.register(...)` in section 4. `index.js` holds only imports, registration,
and wiring; the list helpers live in `builtin/lists.js`, built by `createListHelpers` with the
pipeline, and the startup checks run through `assertRegistriesValid` from core. A resource-free action, such as
`audit.read_records`, is guarded with `authorize('audit', 'read_records', { resourceIdFn: () => null })`.

## Grants pin their resource, so a resource carrying one cannot be hard-deleted

`grant.resource` is `onDelete: Restrict`. Every dataset and every collection now carries at
least the owning group's seeded grant, so this is the normal case rather than an edge one.

A collection has no delete: it is archived instead, so no service removes one. A test that
deletes a collection through Prisma directly for teardown has to remove its grants first, as
`deleteCollection` in `tests/services/helpers.js` does.

Datasets are soft-deleted, so their grants stay and this does not arise.

## The owning group's grant is a row, not a rule

Membership of the owning group confers no read. Creating a dataset or a collection writes a
grant to the owning group, carrying the read plane only: `DATASET:LIST_FILES` or
`COLLECTION:LIST_CONTENTS`, either of which satisfies its `VIEW_METADATA` counterpart through
the access-type closure. `creation_type` is `SYSTEM_BOOTSTRAP`, so it reads differently from an
admin's deliberate grant.

The visible consequence is that an ordinary member opening a resource their group owns is
labelled `GRANT HOLDER`, not `MEMBER`. That is correct: the access came from the row.

@see docs/design/groups/decisions.md — 12. Owning-group members get a seeded grant, not structural read

## A policy that requires an unhydratable attribute is a 500, and only for non-admins

A policy's `requires.resource` names attributes the hydrator must supply. When one is neither
a column on the model nor a registered virtual attribute, hydration throws
`HydrationError: [<model>] Unknown attributes: <name>` and the request dies with a 500 before
`evaluate` runs.

Two things make this hard to notice.

**A platform admin never sees it.** The engine allows a platform admin before any policy runs,
so the hydrator is never reached. A browser pass driven as `test_user` proves nothing about a
policy path — sign in as a group admin such as `user-054` instead. This is how a 500 on
`POST /grants/:id/revoke` survived a phase that was driven end to end in the browser.

**A route that pre-fetches hides it too.** `authorize('grant', 'create', { preFetchedResourceFn })`
supplies the attributes itself, so the same policy works there and fails only on the routes
that authorize from an id alone.

The fix is a virtual attribute on the model's hydrator. `grant.resource_type` is not a column —
the type lives on the `resource` row — so `builtin/hydrators/grant.js` resolves it, and
`access_request.js` does the same for `resource2` after the identical mistake. A model with no
entry in `hydratorRegistry` gets `createDefaultHydrator`, which has no virtual attributes at
all, so adding a policy requirement to such a model is where this bites.

**Both are now caught before a request.** `authorization/index.js` calls
`assertRegistriesValid`, which runs `findUnhydratableRequirements` at boot and throws, listing each term, attribute rule, and
transition whose requirement no hydrator can supply. That check found `grant.subject_type`
missing on 2026-09-15, and the API refused to start until a virtual attribute was added.
A boot throw shows as nodemon crash-looping in the API log. It can prove only that a name
resolves. `tests/authorization/hydrateEveryAttribute.test.js` hydrates every declared attribute
against a seeded row, so a loader that throws fails there.

`tests/authorization/grantHydrator.test.js` shows the shape: call
`hydrator.hydrate({ id, attributes })` — an object, not positional arguments — and assert the
attribute resolves.

## A list query must widen through the access-type order, as the page does

A page decides with `userHasGrant`, which reads a hydrated set already closed over the
access-type order. A list query filters grant rows in SQL, and `gat.name IN (...)` matches a
literal type, not the types that imply it. Two lists got this wrong in opposite directions.

- **Too strict.** `POST /collections/search` matched `COLLECTION:VIEW_METADATA` literally, so a
  collection held through `COLLECTION:LIST_CONTENTS` opened by id and never appeared in the list.
- **Too loose.** `GET /v2/datasets` passed no type filter, so a bare collection grant listed
  every dataset in the collection, and each one's page then refused with 403.

Widen the page's type with `grantService.satisfiedBy([...])` and pass the result to the query.
`accessPathsQuery` throws when given an empty type list, so the loose form cannot return
there. `api/tests/services/grants/listVisibility.test.js` is the parity harness. Add a
case when a new grant shape appears. It failed four of its ten cases against the code before
the fix, so it measures something.

A grant on a collection may carry dataset access types, and those count for the datasets in
it. A collection access type never counts for a dataset. The collection Datasets tab reads
`GET /collections/:id/datasets`, which lists every dataset and gives each row
`_meta.capabilities` and `_meta.standing` from `decideRows`. A row without `view_metadata` does
not open, so browsing and opening can differ row by row.

Check a list change against the live API per persona: call the list, then the page for every
row it returns, and expect no 403.

## Attribute rules combine by union

`evaluateAttributeFilters` returns the field list of every rule whose policy matches, and
`createFilterFunction` merges the projections by key. A negation in one rule removes a key only
when no other matching rule keeps it. Rule order decides nothing.

It used to stop at the first match. The `VIEW_SENSITIVE_METADATA` rule once sat below the
`VIEW_METADATA` rule, so no grant holder received paths, and an overseer who also held the
sensitive grant still lost `staged_path` until Phase 5. Do not reintroduce a short-circuit to save
evaluation: every builtin term reads `access_paths`, which is already cached for the resource.

`tests/authorization/attributeRuleOrdering.test.js` checks that a caller matching any two rules sees
every key either shows, and still reports the lists first-match would get wrong.

Assert reachability by running the decision, not by reading the rule list.
`tests/services/grants/grantHolderAttributes.test.js` grants each access type and checks what
`authorizeAction(...).filter(dataset)` returns.

`projectObject` copies plain objects and arrays and leaves `Date`, `BigInt`, and `Decimal` values as
they are. A projection never shares a nested object with the source row.

`projectObject` once turned a `null` relation into `{}` wherever a filter named a key inside it,
so a UI check such as `v-if="grant.source_preset"` rendered an empty badge. A generator whose
trees match every path cannot find this. The tests in `src/utils/expression/index.test.js` under
"shapes the path does not expect" generate trees with `null`, primitives, arrays, and `Date`s, and
paths over the same few keys plus prototype names. Extend those when projection changes.

Write any shell heredoc that carries backticks with a quoted delimiter (`<<'EOF'`). An unquoted
one runs each backticked word as a command and silently drops it from the text.

## The restriction checker allows everything, and the seam is still live

`checkRestriction` in `builtin/restrictions.js` returns `null` for every action. Archiving and
deletion are resource state, answered by `src/state` from the services, so no restriction type
is specified and nothing blocks. The seam itself stays: the engine calls the checker before any
policy, and an application can inject one that blocks.

Do not treat the no-op as dead code. `tests/authorization/restrictionSeam.test.js` injects a
checker that blocks one dataset action and asserts all three places a restriction acts — the
decision carries `blockedBy`, the capability map turns the action to `false` rather than dropping
the key, and `filterRestrictedCapabilities` does the same over a list row. It also asserts the
builtin checker blocks none of the 50-odd registered actions, which is what makes the rest of
that file a test of the seam rather than of a coincidence.

An earlier layer resolved a target per resource type and threw when it could not find one. That
whole failure mode is gone with the target resolution; what replaced it is that each service
asks the resource's own state under its row lock.

## Actions declare their restriction class beside their policy

A container's `.actions({...})` takes `mutating(policy)`, `reading(policy)`, or
`readingData(policy)` from `core/policies/PolicyContainer.js`, and `getRestrictionClass(action)`
reads it back. `tests/authorization/registryCompleteness.test.js` fails on an action with no
class.

The three classes are load-bearing even with no restriction in force. `core/capabilities.js`
selects the non-mutating actions by class, `tests/model/badgeCoverage.test.js` and
`standingArm.test.js` key off it, and the reference model's `stateAdmits` derives its answer
from the class rather than from the state rules — which is what keeps that oracle independent
of the code it checks. The name `getRestrictionClass` outlived the layer it was named for; the
values are `mutating`, `reading`, and `data`.

Every leaf term carries `meta`: `{ pathKind }`, with `accessType` for a grant term, or
`{ pathKind: null, rule }` for `always`, `never`, and `platform_admin_only`. `Policy.or`, `and`,
and `not` keep `operator` and `children`, and `policy.terms()` lists the unique leaves. The
tables under `builtin/tables` and the reference model under `api/tests/model` read only these.
A new term with no `meta` fails the completeness test.

`access_request` has separate `submit` and `withdraw` actions. The routes authorize those, not
`update`. Each carries a transition row naming the states it moves between.

## Cache keys carry the model name

The resource cache is one Map shared by every resource type in a request. `PrismaHydrator.cacheKey(model, id)`
returns `<model>:<id>`. Code that seeds a cache, such as `core/middlewares.js` and
`middleware/auth.js` for the user, must call it rather than use the bare id. A bare key is
a silent miss, not an error.

## Platform admin reads `current_roles`, never `roles`

Routes seed the JWT profile into `req.policyContext.cache.user` and pass it as `preFetched.user`.
That profile carries the roles the user held at login. `isPlatformAdmin` therefore requires
`current_roles`, a virtual attribute on the user hydrator that no profile carries, so it is always
read from `user_role`. Do not rename it back to `roles`, and do not put `current_roles` into a
pre-fetched user. `tests/authorization/platformAdminFromDatabase.test.js` pins both directions.

A route that branches on platform admin calls `callerIsPlatformAdmin(req)` from
`@/authorization`, which reads `current_roles` through the request's policy context. Never use
`auth.isPlatformAdmin(req)` in a v2 route, because it reads the session. Two readers remain:
the persona in `GET /v2/users/me`, which Phase 5 retires, and `listEligibleOwnerGroups`, which
takes roles from the user object its caller passes. Both are filed in
`.todo/local/L1-authorization-enforcement.md`.

## Capabilities are authority only; state is the other answer

Neither the gate nor the capability map reads a resource's state. `_meta.capabilities` says what
the caller could do, and `_meta.available_actions` says what the resource's state admits, from
`availableActionsOf` over the rules in `src/state/builtin/`. A wrong-state action is refused
by the service with a 409, and a gate refusal would be a 403 instead. A reviewer therefore holds
`review` on a decided request, and the request is what withholds it.
`tests/model/transitionsArm.test.js` checks every request status for the requester, the group
admin, and a platform admin: the capability is blind to status, and `available_actions` is not.

## The comparison arms

`api/tests/model` holds the reference model, the world generator, and the arms.

- `node tests/model/runEngineArm.js [report.json]` writes the covering world into `app_test`,
  runs the Engine arm, prints disagreements grouped by action with the dimension values they
  share, and removes the world. It takes about 10 seconds. The hydrators log every query, so
  filter the output with `grep -E "^wrote world|^engine arm:|^\[[0-9]+\]|^  shared:"`.
- `tests/model/engineArm.test.js` runs the Engine and Creates arms. A new
  disagreement fails as unclassified. Add a `CLASSIFIED` entry only with the decision that
  settles it and the phase that removes it; a classification that stops matching fails as stale.
- `tests/model/pathsArm.test.js` compares `accessPathsQuery` with the reference's `termPaths`:
  path kinds, widened grant types, and list membership. `tests/model/listsArm.test.js` compares
  the dataset, collection, and group searches with the reference for `view_metadata`.
- The Term forms arm is retired. Both grant term forms now read `accessPathsQuery`, so the
  comparison could not disagree.
- `tests/model/dbWorld.js` writes rows directly. `group_closure` has no trigger, so it writes the
  self row and every ancestor row itself. The quarantine group and the system principals are the
  seeded rows.

## The builtin terms read `access_paths`

The dataset, collection, and group terms decide from one context attribute, `access_paths`.
`loadAccessPaths` in `builtin/paths/index.js` runs `accessPathsQuery` bound to the one resource
and returns `{ rows, kinds, access_types }`, with the grant types widened. A term is a set test,
such as `context.access_paths.kinds.has('admin')`. Do not add a user fact such as a group id list
for a new dataset, collection, or group term; add a path kind to the statement instead, and the
Paths arm checks it.

Each path-based type's SQL is its own file, `builtin/paths/<type>.js`, exporting
`{ resourceType, sql, prospectiveKinds }`, and `authorization/index.js` registers it with
`pathRegistry.register(...)`. A type whose terms never read `access_paths` registers nothing.
Services import `accessPathsQuery` and `accessibleIdsQuery` from `@/authorization`, not from
`builtin/paths`. The registrations run when `index.js` loads, so a service that imported the paths
module directly failed under jest with `no paths are registered for resource type dataset`.

A create has no resource id. `contextIdentifiers` in `core/hydrationUtils.js` passes the
pre-fetched resource as `prospective`, and the loader reads the owning group's rows limited to
the type's `prospectiveKinds`. The context cache key includes the prospective resource, because the batch
create route checks several owning groups in one request.

`findAsyncTerms` runs at boot. An `evaluate` declared `async` fails startup, because it reads the
database behind its `requires`. Put the read in a hydrator virtual attribute, as
`resource_owner_group_id` on the grant hydrator does.

Measured on 63 detail checks in the covering world, one run each: the median check went from 7
queries to 3, and the maximum from 9 to 5.

## Relations named for current state read the views

`group.members`, `collection.datasets`, and `dataset.collections` are Prisma relations to the
`view` models `active_group_user` and `active_collection_dataset`. The base-table relations are
`group.membership_history`, `collection.dataset_history`, and `dataset.collection_history`. So an
include, a filter, or a `_count` through the plain name returns only open rows, and history is
asked for by name. `tx.active_group_user.findFirst(...)` reads one membership in force.

Prisma cannot `orderBy` a relation count through a view relation. It fails with
`Unknown argument _count`. `searchAllCollections` ranks by the counted relation in memory.

Writes still go to the base models. A view model has no create or update. That includes a nested
write: `collection.create({ data: { datasets: { create: [...] } } })` fails with `Unknown argument
create`, and only `connect` is offered. Write through `dataset_history`. `createCollection` did this
until 2026-09-15, and no API test created a collection with `dataset_ids`, so the e2e world build
found it as a 500 on `POST /collections`.

`tests/authorization/currentStateScan.test.js` fails on `removed_at: null`, `revoked_at: null`, or
`is_archived: false` in `api/src` outside its allowlist. Each entry names why it is not a read of
current state, and an entry that stops matching fails as stale.

## Probing the engine from a script

A one-off script can call the shipped engine against the development database. It must run from
inside `api/`, because `module-alias` reads `api/package.json`:

```js
require('module-alias/register');
const prisma = require('@/db');
const { authorizeAction, policyRegistry } = require('@/authorization');
```

Write the script in the scratchpad, copy it into `api/`, run it with `node`, and delete it.
macOS has no `timeout` command, so use the tool timeout instead. `policyRegistry.get(type).getActionNames()`
lists the registered actions.

`authorizeAction` expects `identifiers: { user, resource }`. Passing `{ group_id }` throws
`AuthorizationError: [policy:isPlatformAdmin] User identifier is required`. `GET /groups/slug/:slug`
does exactly that, which is how it was found.

## A list shows public attributes; a row shows more only on its detail route

Collection, group, dataset, and grant each have a `list` action: `Policy.always`, with one
attribute rule (decision 16). A search route binds `authorize(type, 'list')`, its query scopes
the rows, and `req.permission.filter` projects every row. The rule gives the public attributes;
the platform-admin short-circuit gives `'*'`. No per-row decision runs. The group rule adds
`depth`, the row's place in a search or a lineage. Grant lists use the container's `'*'` rule,
the grant attributes, because their queries return only grants the caller holds or governs.

A `list` action needs a `list: always` state rule too, or the startup sync check throws.

A route whose own decision is about the resource in the URL, such as ancestors, descendants, or
source and derived datasets, gets the list filter from `require('@/authorization').import(type).listFilter()`, bound when the
route module loads.

`tests/authorization/listFilter.test.js` pins that an owning-group admin still sees only
public fields on a list row.

A group search row carries `_meta.standing` for its badge. `standingOfRows` reads it from one
`accessPathsByResource` statement for the page and maps each row's paths with
`standingFromPathRows`, so it matches the detail route's path rows without evaluating a policy.

Never project another resource's row with `req.permission.filter`. That filter was decided for
the resource in the URL. The lineage and ancestor routes did this, so an owning-group admin's
`['*']` reached datasets and groups owned by someone else.

`decideRows` gives each row `_meta.capabilities` and `_meta.standing` with the detail route's
composition. For a dataset, a collection, or a group it reads the page's paths once with
`accessPathsByResource`, then seeds each row's check. Every row passes through
`filterRestrictedCapabilities`, which costs nothing while the builtin checker blocks nothing.

No search list sends `_meta.available_actions`. The access-request and grant panels that do build
it by hand from fields their own queries fetch. `tests/model/listRowsArm.test.js` compares
`decideRows` against the single-row composition.

## Standing replaces the first-match role

`deriveStanding` collects every term with `meta.pathKind` from the container's reading actions
and expands each held term through `expandPath` in `builtin/paths/standing.js`. A platform admin's
standing starts with `platform_admin` and lists every other path too.

A dataset never has a `member` path in standing. Its only member term serves `contribute`, which
is mutating. The standing arm's coverage list says so; do not add it back.

The badge is a display function in `ui/src/services/v2/standing.js`. `badgeFor` walks
`BADGE_PRECEDENCE`, and `rowBadgeFor` drops `platform_admin` on list rows, where it would repeat
on every row. `tests/model/badgeCoverage.test.js` checks every standing kind has a row, reading the
UI file as text.

## Derived capabilities and state the capability map carries

- `request_access` is not an action. `mayFileRequest` in `services/access_requests` decides it,
  and the dataset and collection detail routes append it when a signed-in caller could file a
  request: no restriction blocks it, and the request's `create` state rule admits the resource.
  It lives in the service, not in `authorization/`, because the deciding part is a state rule.
- `authorization/` holds the decision engine only. Code that writes records or encodes one
  resource's business rule belongs in `services/`: the audit writer, `AuditBuilder`, lives in
  `services/audit/` beside the audit reader, and `authorization/index.js` does not import
  `src/state`.
- Group and collection `archive` and `unarchive` are withheld by their state rules, not by the
  capability map: `archive` is not in `available_actions` on an archived group, and `unarchive`
  is not there on an active one. A platform admin holds both capabilities in every state.

## One pipeline decides for the middleware and for `authorizeAction`

`core/pipeline.js` `createDecisionPipeline` is the only decision path. The middleware in
`core/middlewares.js` builds one and `authorization/index.js` builds another from the same
arguments; `authorizeAction` is that second one. The order is restriction checker, platform-admin
policy, then the action's policy. Capabilities are every action for a platform admin and
`evaluateCapabilitySet` for anyone else, and both branches then pass through
`filterRestrictedCapabilities`, so a caller of `authorizeAction` no longer needs to filter them
again. Neither branch reads the resource's state.

A refusal carries `status`. `concealRefusalsWithoutStanding` lists the resource types whose
refusals are concealed, and the application passes `pathRegistry.listTypes()`: dataset,
collection, and group. Any other container answers 403, because its id may name another type's resource. The
grant listing authorizes `grant` on a dataset id, and a member of the owning group holds no
grant-container term, so concealing there answered them 404. For a listed type, a
refusal on a named resource is 404 when `deriveStanding` finds nothing and the caller is not a
platform admin, and 403 otherwise. A route that decides in its handler answers with
`decision.status` rather than a literal 403. `refusalMessage(permission)` gives the text. A
caller refused `view_metadata` still gets `standing` when the call asked for it, because a
public-profile reader stands on a group they cannot open.

Routes with no resource id, such as `POST /grants` or a create, always answer 403.

## A record with no id is never cached

A create decision has `identifiers.resource === null` and names its owning group in
`preFetched.resource`. `PrismaHydrator.hydrate` keys its cache by id, and pre-fetched keys never
overwrite cached ones, so before 2026-09-15 two creates in one request shared the
`dataset:global` entry. The second was decided on the first one's `owner_group_id`: the bulk
create route authorized a later group on the earlier group's facts. The hydrator now builds a
record with no id for that call alone. `tests/authorization/nullIdHydration.test.js` pins it, and
any loop that decides several creates through one `req.policyContext` depends on it.

## Rows from the extended Prisma client cannot be structured-cloned

`api/src/db.js` extends the client with computed result fields: `grant.expiry`, `grant.is_active`,
and `access_request_item.requested_expiry` and `approved_expiry`. Objects carrying them make
`structuredClone` throw `DataCloneError: #<Object> could not be cloned`. `PrismaHydrator` copies
pre-fetched attributes and fetched records with `copyTree` from `utils/expression` instead.

It surfaced when `decideRows` passed whole access-request rows as the pre-fetched resource, and
`GET /access-requests/requested-by-me` answered 500 for any caller with a request. The dataset
list did not fail, because its policies read only `access_paths` from the context. When a clone
fails, walk the object's own properties and check `util.types.isProxy`; the item inside the row,
not the row, is the object Prisma wraps. `tests/authorization/hydrateExtendedRows.test.js` pins it.

## A deleted dataset is answered by its own state rules

There is no DELETED restriction and no view deriving one. `state/builtin/dataset.js` reads
`is_deleted` directly: a deleted dataset refuses every change and every data-plane action, and
still admits reading its record. A service that writes locks the row with `lockDataset` in
`datasets_v2/index.js`; a read-only caller in `files.js` reads it with `findDatasetRow`. Both merge
the dataset fragment, so neither restates the fields.

## A new container fails the suite until it is placed

Registering a container is not enough. Three checks read `policyRegistry.listTypes()`:

- `registryCompleteness.test.js` fails on an action declared as a bare policy, because it has no
  restriction class. The pre-2026-09-15 `custom/README.md` example wrote actions that way.
- `modelCoverage.test.js` fails on a type that is neither in `MODELLED_RESOURCE_TYPES`, exported by
  `tests/model/reference.js`, nor in its own `NOT_MODELLED` map with the path of the test that
  decides it. `reference.decide` throws on any other type.
- `modelCoverage.test.js` also fails on an enum value no world reaches and no entry declares
  unread. The check reads `@prisma/client`, so a schema edit counts only after `prisma generate`.

Measured on 2026-09-15 on a scratch branch. A fully declared container, with `reading` and
`mutating` on every action, passed every suite until the resource-type check was added. With the
check in place it fails on "resource type throwaway". A `THROWAWAY` value on `GROUP_MEMBER_ROLE`
fails the enum check.

## Resource state is a separate layer, in `src/state/`

What a caller may do is authorization. What the resource's current state admits is a different
question, answered after it, and a refusal there is a 409 rather than a 403. `src/state/` holds
that layer, split the way this one is: `core/` is framework code, `builtin/` has one file per
resource type, and `custom/` is the extension point.

Which actions a state admits is business logic and belongs to the resource, so there is no table
keyed by restriction class. An archived group refuses its own mutations; an archived collection
also reads its owning group's column, one step up; a deleted dataset refuses mutation and every
read of its bytes and keeps its record readable. Each of those sentences lives in that resource's
file.

Three things follow for a caller.

- **A rule is pure, and the caller fetches.** `requires` names the field paths the rule reads, such
  as `owner_group.is_archived`. A service reads the row inside its transaction after its row lock
  and calls `assertPossible`, which throws 409. A list fetches the fields once for the page and
  calls `availableActions` per row. `requiredFields(type)` gives the union to select.
- **A container declares a `select` fragment, and the caller merges it into its own query.**
  `withStateFieldsOf(type, { where, include })` returns the arguments with the fragment
  merged, so the row the caller already fetches carries the state fields and no second read is
  needed. Under `select` the whole fragment merges; under `include` only its relations do,
  because Prisma rejects a column named in `include` and returns every column anyway. The
  caller's key wins a clash, so `owner_group: true` is not narrowed. A raw `FOR UPDATE` cannot
  take a fragment: lock with `SELECT id ... FOR UPDATE`, then read with the fragment, as
  `lockCollection` in `services/collections.js` and `lockGroup` in `services/groups.js` do.
- **A module that works with one type imports the layer bound to it.**
  `const { assertPossible, withStateFields } = require('@/state').import('collection')` gives
  the same functions with the type supplied. The unbound exports carry an `Of` suffix and take the
  type first, such as `assertPossibleOf(type, action, row)`; the bound ones drop both. `import`
  throws at require time for a type with no state container. Every service and route uses it.
- **Every type but `user` and `audit` declares a fragment.** `selectOf` on those two throws.
  A fragment of columns alone, as the group's is, merges nothing into an `include`, because
  `include` returns every column already; `withStateFields` is still worth calling there, so a
  relation added to the fragment later reaches the query.
- **A grant and an access request are given the raw row, and their container shapes it.** Their
  fragments fetch `resource` with `TARGET_SELECT` and `subject` with `SUBJECT_SELECT`. The container
  declares `shape`, which `check` and `availableActions` apply, turning those relations into the
  `target` and `subject` the rules read. A new grant or request is checked as a row of just
  `resource` and `subject`, each fetched with `select().resource` and `select().subject`. A list
  whose hydrated rows lack `owner_group`, as `GET /grants/subject/...` does, fetches the resources
  once more with the fragment and passes those. Named examples are already in the rules' form and
  are not shaped, so a test of a grant rule passes a raw row (`tests/state/rows.js` builds them)
  and a test of what an archived example forbids uses `forbiddenActionsOf`, never `check`.
- **A detail route builds `_meta` with `buildMeta(type, row, permission)`** from `src/services/meta.js`.
  It sits outside `src/authorization`, because authorization does not import
  the state layer.
- **A missing field is an error, not a false.** `check` throws naming the path, so a caller that
  selected too little fails loudly instead of deciding from `undefined`.
- **The two layers are kept in step at startup.** `findStateGaps` reports a policy container with
  no state file, an action with no rule, and a rule naming no action, and `src/state/index.js`
  throws on any of them. An action no state limits declares `always`. A resource with no policy
  container, as an invitation has none, declares `standalone: true`.

The restriction class stays on each action, for restrictions once they are specified. State rules
never read it. `tests/state/rules.test.js` drives every rule with no database, and
`tests/state/sync.test.js` pins the startup check.

@see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer

## Four things that bite when adding a state check to a service

- **A list passes its rows; it never re-queries inside the loop.** `bulkStage` takes dataset rows
  and calls `check` on each one, because the caller already fetched the page. Putting a lookup
  inside the loop makes a pure decision depend on the database, turns a unit test that fabricates
  rows into one that needs fixtures, and leaves nothing sensible to do when a row is missing. The
  caller widens its own query instead: the collection stage route passes
  `includes: { owner_group: true }`.
- **The state check goes before the service's own validation, not after.** `addDatasets` used to
  answer 400 from a bespoke predicate for an archived owning group and 409 from the state check
  inside its transaction. The two answer different questions, so the state check runs first and
  the validation query keeps only what it alone decides: unknown, deleted, or foreign datasets.
  A predicate the state rule already covers is a duplicate to delete, not a second opinion.
- **A dataset is addressed two ways.** Services take the numeric `dataset.id`; routes, the
  authorization layer, and `collection_dataset` take `resource_id`. `lockDataset` takes the
  numeric id, and `findDatasetRow` in `services/datasets_v2/files.js` takes `resource_id` and
  returns the numeric id along with the state fields. A test passing `dataset.id` where a service wants `resource_id` fails as
  a validation error rather than as a type error, so check which the function reads.
- **Most of these services return nothing.** `addGroupMembers` and friends return whatever their
  `$transaction` callback returns, which is often `undefined`. Assert on the row, with
  `activeMembership` or a re-read, rather than on the return value.

## A dataset deletes; it does not archive

Groups and collections archive, reversibly, and archiving is authorized separately from
unarchiving. A dataset's lifecycle ends at `dataset.delete`: the record stays, the archived files
go, and there is no undo. The route is `DELETE /v2/datasets/:id`, there is no `dataset.unarchive`,
and `route_policy_bindings.test.js` asserts both action names are absent from the dataset policy
container so the pairing test cannot silently start applying to it.

## Configuration is checked when the module loads, not per request

A mistake in a policy, an attribute rule, a hydrator, a paths file, or a route's action name
fails startup. Each check lives where the thing is declared, and the engine does not re-check
per call what startup already proved. `tests/authorization/bootValidation.test.js` pins each one.

- `PolicyContainer.attributes()` parses every attribute path with `compileProjection`, and
  refuses a malformed one such as `owner..name` or `items[0].id`. `projectObject` reuses the
  parse for a list it has seen, by the list's identity. `base_attributes.js` compiles its lists
  at load, because routes project with them outside any rule.
- `PolicyContainer.freeze()` refuses rules keyed by an undeclared action, and an action with no
  rule of its own and no `'*'` rule. `audit.read_records` gained an explicit rule for this.
- `PathRegistry.register` checks `resourceType`, `sql`, and `prospectiveKinds`, and
  `pathRegistry.assertValid(policyRegistry)` refuses paths for a type with no container and
  prospective kinds with no group paths.
- `createDecisionPipeline` checks both registries, the injected functions, and the concealed
  types, and resolves the `user`, `context`, and every action's resource hydrator. A type whose
  default Prisma hydrator has no model fails here.
- A route binds its decisions with `require('@/authorization').import(type)`: `.action(name)`,
  `.rows(name)`, `.listFilter()`, and `.standingOfRows()`. Each checks the type, the action, or
  the paths when called at module load. The workflow routes bind every action in
  `workflow_policy_actions`. The string forms `authorizeAction(type, action)` and friends remain
  for tests.

Per call, the engine checks only the request's own values: `identifiers.user`, an id needed to
fetch, the attributes a hydrated entity actually carries, and unknown attribute names a service
passes a hydrator directly. The middleware unit tests use real registries, because the pipeline
refuses mocks when it is built.

## Keeping this current

When a session hits engine behaviour this page does not explain — an injection point that was
not obvious, a filter that returned something unexpected, a hydrator that never ran — amend
this file in the same change. Verify a claim by running the suite or the live app before
writing it down.

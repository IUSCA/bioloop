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
looks like a hydration failure rather than a filter decision.

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
2 and a `policyRegistry.register(...)` in section 4. A resource-free action, such as
`audit.read_records`, is guarded with `authorize('audit', 'read_records', { resourceIdFn: () => null })`.

## Grants pin their resource, so a resource carrying one cannot be hard-deleted

`grant.resource` is `onDelete: Restrict`. Every dataset and every collection now carries at
least the owning group's seeded grant, so this is the normal case rather than an edge one.

`deleteCollection` removes the collection's grants in the same transaction before deleting it.
A revoked grant on a collection that no longer exists is not a fact anybody can use, and who
held access survives in `authorization_audit`, which stores ids rather than holding foreign
keys. A test that deletes a collection through Prisma directly has to do the same.

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

**Both are now caught before a request.** `authorization/index.js` runs
`findUnhydratableRequirements` at boot and throws, listing each term, attribute rule, and
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

Write any shell heredoc that carries backticks with a quoted delimiter (`<<'EOF'`). An unquoted
one runs each backticked word as a command and silently drops it from the text.

## A restriction check with no target throws

`checkRestriction` in `builtin/restrictions.js` first asks `actionCouldBeBlocked`. A reading
action returns null there without a query. For a restrictable action, `restrictionTargetFor`
resolves the target, and a missing one is a `RestrictionTargetError` that names the action.

- A group resolves by its id. A root group being created has no parent, so nothing restricts it.
- A dataset or collection resolves by resource id. A create resolves by the `owner_group_id` the
  pre-fetched resource names, so creating under an archived group, or a child of one, is blocked.
- A grant or access request resolves through `preFetched.resource_id`, and otherwise by reading
  the row's `resource_id`. An id naming no row returns null, so the service answers with its 404.

Until 2026-09-15 a missing target returned null and allowed the action. Five routes relied on
that shape. `tests/services/restrictions/restrictionTargets.test.js` archives a collection and
checks review, update, and revoke are refused. A new mutating route with neither an id nor a
pre-fetched resource now throws in its first test rather than passing silently.

## Actions declare their restriction class and transition beside their policy

A container's `.actions({...})` takes `mutating(policy, transition?)`, `reading(policy)`, or
`readingData(policy)` from `core/policies/PolicyContainer.js`. `getRestrictionClass(action)` and
`getTransition(action)` read them back. `tests/authorization/registryCompleteness.test.js`
fails on an action with no class.

`RESTRICTION_TYPES` in `builtin/restrictions.js` says which classes each type blocks: ARCHIVED
blocks `mutating`, and DELETED blocks `mutating` and `data`. Both exempt `unarchive`. No list
names actions, so a new action is classified by its own row. `typeBlocks` reads the class from
the registry on first use, because the registry module requires `restrictions.js` while it
builds. DELETED has no restriction rows: `effective_restriction` derives it from
`dataset.is_deleted`.

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

## Capabilities consult the transition table; the gate does not

`applyTransitions` in `core/capabilities.js` withdraws a capability when the resource's state is
not one of the action's from-states. `evaluateCapabilitySet` and the platform-admin branch of
`authorizeAction` both call it. The gate itself never reads state, because a wrong-state action
is refused by the service with a 409, and a gate refusal would be a 403 instead.
`tests/model/transitionsArm.test.js` checks every request status for the requester, the group
admin, and a platform admin.

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
`loadAccessPaths` in `builtin/accessPaths.js` runs `accessPathsQuery` bound to the one resource
and returns `{ rows, kinds, access_types }`, with the grant types widened. A term is a set test,
such as `context.access_paths.kinds.has('admin')`. Do not add a user fact such as a group id list
for a new dataset, collection, or group term; add a path kind to the statement instead, and the
Paths arm checks it.

A create has no resource id. `contextIdentifiers` in `core/hydrationUtils.js` passes the
pre-fetched resource as `prospective`, and the loader reads the owning group's rows limited to
`PROSPECTIVE_KINDS`. The context cache key includes the prospective resource, because the batch
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

## A list decides each row; no decision covers a page

The four `Policy.always` list actions are gone (decision 16). A list route binds no `authorize()`.
Its query scopes the rows, and `projectRows` in `src/authorization/index.js` projects each row by
that row's own read decision. A row the caller cannot read shows the public attribute list the
route passes. `relationAttributes` keeps fields that describe the row's place in the list, such
as `depth` or `_count`, whatever the decision.

Never project another resource's row with `req.permission.filter`. That filter was decided for
the resource in the URL. The lineage and ancestor routes did this, so an owning-group admin's
`['*']` reached datasets and groups owned by someone else.

`decideRows` gives each row `_meta.capabilities` and `_meta.standing` with the detail route's
composition. For a dataset, a collection, or a group it reads the page's paths once with
`accessPathsByResource` and the restrictions once with `restrictionTypesByTarget`, then seeds
each row's check. Other containers, such as `access_request`, fall back to
`filterRestrictedCapabilities` per row. `tests/model/listRowsArm.test.js` compares the batch
against the single-row composition, and `tests/model/relatedRowsArm.test.js` counts rows where
the parent's projection would have differed.

## Standing replaces the first-match role

`deriveStanding` collects every term with `meta.pathKind` from the container's reading actions
and expands each held term through `expandPath` in `builtin/standing.js`. A platform admin's
standing starts with `platform_admin` and lists every other path too.

A dataset never has a `member` path in standing. Its only member term serves `contribute`, which
is mutating. The standing arm's coverage list says so; do not add it back.

The badge is a display function in `ui/src/services/v2/standing.js`. `badgeFor` walks
`BADGE_PRECEDENCE`, and `rowBadgeFor` drops `platform_admin` on list rows, where it would repeat
on every row. `tests/model/badgeCoverage.test.js` checks every standing kind has a row, reading the
UI file as text.

## Derived capabilities and state the capability map carries

- `request_access` is not an action. `mayRequestAccess` appends it on the dataset and collection
  detail routes when a signed-in caller could file a request that no restriction blocks.
- Group and collection `archive` and `unarchive` carry `archivedState` transition rows, so
  neither is offered in the state that refuses it. Dataset `archive` means the tape archive and
  has no such row.
- The middleware's platform-admin branch applies transitions too. Before Phase 5 it returned
  every action as true, so a platform admin was offered Unarchive on an active group.

## One pipeline decides for the middleware and for `authorizeAction`

`core/pipeline.js` `createDecisionPipeline` is the only decision path. The middleware in
`core/middlewares.js` builds one and `authorization/index.js` builds another from the same
arguments; `authorizeAction` is that second one. The order is restriction checker, platform-admin
policy, then the action's policy. Capabilities pass through `applyTransitions` or
`evaluateCapabilitySet` and then `filterRestrictedCapabilities` on both branches, so a caller of
`authorizeAction` no longer needs to filter them again.

A refusal carries `status`. `concealRefusalsWithoutStanding` lists the resource types whose
refusals are concealed, and the application passes `RESOURCE_TYPES`: dataset, collection, and
group. Any other container answers 403, because its id may name another type's resource. The
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

## DELETED is derived, not written

`effective_restriction` has an arm that reads `dataset.is_deleted` and emits type DELETED, so no
code path writes a DELETED restriction row and every soft delete, v1 or v2, is covered. The
service guards call `isRestricted(tx, target)` from `services/restrictions.js`, which reads the
same view, so a guard refuses a soft-deleted dataset's collection target only through its owner.

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

## Keeping this current

When a session hits engine behaviour this page does not explain — an injection point that was
not obvious, a filter that returned something unexpected, a hydrator that never ran — amend
this file in the same change. Verify a claim by running the suite or the live app before
writing it down.

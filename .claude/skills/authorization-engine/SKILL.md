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
`accessibleDatasetIdsByGrantsQuery` throws when given no types, so the loose form cannot
return there. `api/tests/services/grants/listVisibility.test.js` is the parity harness. Add a
case when a new grant shape appears. It failed four of its ten cases against the code before
the fix, so it measures something.

A grant on a collection may carry dataset access types, and those count for the datasets in
it. A collection access type never counts for a dataset. The collection Datasets tab reads
`GET /collections/:id/datasets`, which lists every dataset and marks each with
`_meta.can_view_metadata`, so browsing and opening can differ row by row.

Check a list change against the live API per persona: call the list, then the page for every
row it returns, and expect no 403.

## Attribute rules stop at the first match, so grant rules run widest first

`attributeFilters.js` evaluates a rule list in order and returns the first rule whose policy
passes. Every dataset access type implies `DATASET:VIEW_METADATA`, and the hydrated grant set
is already closed over the order. A `userHasGrant('DATASET:VIEW_METADATA')` rule therefore
matches every grant holder, and any grant rule placed below it never runs.

This was live until 2026-09-14. The `VIEW_SENSITIVE_METADATA` rule sat below the
`VIEW_METADATA` rule, so no grant holder ever received paths or `num_files`. The unit test in
`tests/authorization/dataset.attribute_filters.test.js` only checked that a rule naming
`staged_path` existed, which is why it passed.

`tests/authorization/attributeRuleOrdering.test.js` projects every rule list over a
representative row and reports each earlier rule that hides a field a later rule shows. It
pins the one known case, `dataset.*` rule 1 (oversight) above rule 2 (sensitive metadata).
Fixing a list, or breaking one, changes that pinned report.

Assert reachability by running the decision, not by reading the rule list.
`tests/services/grants/grantHolderAttributes.test.js` grants each access type and checks what
`authorizeAction(...).filter(dataset)` returns. Against the old order it failed three of four
cases.

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

A container's `.actions({...})` takes `mutating(policy, transition?)` or `reading(policy)` from
`core/policies/PolicyContainer.js`. `getRestrictionClass(action)` and `getTransition(action)`
read them back. `tests/authorization/registryCompleteness.test.js` fails on an action with no
class, and checks the declaration against `MUTATING_ACTIONS` and `READING_ACTIONS` until
Phase 6 derives those lists from it.

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

## Keeping this current

When a session hits engine behaviour this page does not explain — an injection point that was
not obvious, a filter that returned something unexpected, a hydrator that never ran — amend
this file in the same change. Verify a claim by running the suite or the live app before
writing it down.

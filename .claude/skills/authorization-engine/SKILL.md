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

## Keeping this current

When a session hits engine behaviour this page does not explain — an injection point that was
not obvious, a filter that returned something unexpected, a hydrator that never ran — amend
this file in the same change. Verify a claim by running the suite or the live app before
writing it down.

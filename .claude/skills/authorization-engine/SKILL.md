---
name: authorization-engine
description: How the ABAC engine in api/src/authorization evaluates a request, and the traps that cost a session
---

# The authorization engine

Read these before changing anything under `api/src/authorization/` or `api/src/state/`:

- [api/src/authorization/README.md](../../../api/src/authorization/README.md): layers, `index.js`,
  policies, containers, hydrators, paths.
- [docs/design/groups/access-model.md](../../../docs/design/groups/access-model.md): the decision
  rule, the state check, standing and badges, projection, refusal shapes.
- [docs/contributing/techniques/authorization-engine.md](../../../docs/contributing/techniques/authorization-engine.md):
  the background for every item below, plus the state layer, lists, standing, and the arms.

This skill keeps only the rules and traps a session needs before its first edit.

## Rules that prevent a wrong change

- **`core/` never imports application code.** The restriction checker and the platform-admin
  policy are injected into `createDecisionPipeline`. Do not add a `require` under `core/`.
- **No policy names the platform admin.** The pipeline allows one before any action policy runs.
  For an action nobody qualifies for alone, use `platformAdminOnly` from
  `builtin/policies/utils/index.js`. `platformAdminShortCircuit.test.js` enforces this.
- **The restriction check runs before the platform-admin check.** Moving the short-circuit earlier
  silently lets a restriction stop binding a platform admin.
- **Platform admin reads `current_roles`, never `roles`.** The JWT profile's `roles` are from login.
  Do not put `current_roles` into a pre-fetched user. A v2 route calls `callerIsPlatformAdmin(req)`
  from `@/authorization`, never `auth.isPlatformAdmin(req)`.
- **Dataset, collection, and group terms read `access_paths`.** Add a path kind to the paths SQL,
  not a user fact such as a group-id list. An `async` `evaluate` fails boot; put the read in a
  hydrator virtual attribute.
- **Services import `accessPathsQuery` and `accessibleIdsQuery` from `@/authorization`.** Importing
  `builtin/paths` directly fails under jest with `no paths are registered for resource type dataset`,
  because registration runs when `index.js` loads.
- **`authorization/` does not import `src/state`.** State is checked after authorization, in the
  service, under the row lock, and refuses with 409. Business rules and record writers live in
  `services/`. `_meta` for a detail route comes from `buildMeta` in `src/services/meta.js`.
  @see docs/design/groups/access-model.md — The state check
- **The state check runs before a service's own validation.** Delete a validation predicate the
  state rule already covers.
- **A list passes its rows to `check`.** Never query inside the per-row loop; widen the caller's
  query instead.
- **Never project another resource's row with `req.permission.filter`.** That filter was decided for
  the resource in the URL. Lineage, ancestor, and descendant routes use
  `require('@/authorization').import(type).listFilter()`.
- **A list query widens the page's access type with `grantService.satisfiedBy([...])`.** A literal
  `gat.name IN (...)` hides rows the page opens; no filter lists rows the page refuses.
- **Bind decisions at module load** with `require('@/authorization').import(type)`: `.action(name)`,
  `.rows(name)`, `.listFilter()`, `.standingOfRows()`. The string forms are for tests.
- **A dataset deletes; it never archives.** Do not add `dataset.archive` or `dataset.unarchive`.
- **Attribute rules combine by union.** Do not reintroduce a first-match short-circuit.
- **Do not delete the no-op restriction checker.** `restrictionSeam.test.js` proves the seam works.

## Traps that cost real time

**A platform admin hides policy 500s.** The admin never reaches a hydrator, so an unhydratable
requirement only fails for everyone else. Drive a browser check as a group admin such as `user-054`,
not `test_user`.

**Pre-fetching hides a broken virtual attribute.** A virtual attribute runs only when the entity is
not pre-fetched. Test a hydrator change through `authorizeAction` with only `identifiers`.

**A boot throw looks like nodemon crash-looping** in the API log. Configuration errors fail at
startup, not per request: an unhydratable requirement, a malformed attribute path, an action with no
restriction class or no attribute rule, a policy action with no state rule. Read the first stack.

**An empty attribute rule set grants the action and returns `{}`.** It looks like a hydration
failure. Pass `[{ policy: Policy.always, attribute_filters: ['*'] }]` when everything is meant.

**Cache keys carry the model name.** Seed caches with `PrismaHydrator.cacheKey(model, id)`. A bare
id is a silent miss.

**An object seeded into the user cache must be mutable.** `hydrate` writes into it. A frozen object,
such as `ANONYMOUS_PRINCIPAL`, fails every request with
`TypeError: Cannot assign to read only property 'subject_id'`.

**Extended Prisma rows cannot be `structuredClone`d.** `grant.expiry`, `grant.is_active`, and the
`access_request_item` expiry fields throw `DataCloneError`. Use `copyTree` from `utils/expression`.

**Relations named for current state read views.** `group.members`, `collection.datasets`, and
`dataset.collections` return open rows only. A nested create through them fails with
`Unknown argument create`; write through `membership_history`, `dataset_history`, or
`collection_history`. `orderBy` a `_count` through them fails with `Unknown argument _count`.
`currentStateScan.test.js` fails on a new `removed_at: null`, `revoked_at: null`, or
`is_archived: false` in `api/src`.

**A sweep for `ARCHIVED` must skip `DATASET_STATES.ARCHIVED`.** That constant in
`api/src/constants.js` is the SDA tape-archive workflow state. It has nothing to do with archived
groups or collections, which are `is_archived` columns and the `archived` state names in
`src/state/builtin/`. `DATASET_STATES.DELETED` is the same kind of false positive for `DELETED`.

**A dataset has two ids.** Services take numeric `dataset.id`; routes, authorization, and
`collection_dataset` take `resource_id`. `lockDataset` takes the numeric id; `findDatasetRow` takes
`resource_id`. The wrong one fails as a validation error, not a type error.

**Many services return `undefined`.** `addGroupMembers` and similar return their `$transaction`
callback's value. Assert on a re-read row.

**Grants pin their resource.** `grant.resource` is `onDelete: Restrict`. Test teardown deletes grants
first, as `deleteCollection` and `deleteDataset` in `tests/services/helpers.js` do.

**A new container fails the suite until it is placed.** It needs a restriction class on every action
(`registryCompleteness.test.js`), and an entry in `MODELLED_RESOURCE_TYPES` or `NOT_MODELLED`
(`modelCoverage.test.js`). A new enum value needs a world that reaches it, and counts only after
`prisma generate`.

**`authorizeAction` expects `identifiers: { user, resource }`.** Passing `{ group_id }` throws
`User identifier is required to evaluate policy`.

**Heredocs with backticks need a quoted delimiter** (`<<'EOF'`). An unquoted one runs each
backticked word as a command and drops it from the text.

## Commands

Run the Engine arm against a generated world (about 10 seconds):

```bash
cd api && node tests/model/runEngineArm.js 2>&1 \
  | grep -E "^wrote world|^engine arm:|^\[[0-9]+\]|^  shared:"
```

Probe the shipped engine from a one-off script. Write it in the scratchpad, copy it into `api/`,
run it with `node`, then delete it. macOS has no `timeout`; use the tool timeout.

```js
require('module-alias/register');
const prisma = require('@/db');
const { authorizeAction, policyRegistry } = require('@/authorization');
```

Check a list change per persona against the live API. Call the list, then the detail route for
every row, and expect no 403.

## Tests to run for a given change

| Change | Tests |
|---|---|
| A policy or container | `tests/authorization/registryCompleteness`, `bootValidation`, `platformAdminShortCircuit`, `tests/model/engineArm` |
| A hydrator | `tests/authorization/hydrateEveryAttribute`, `grantHydrator`, `nullIdHydration`, `hydrateExtendedRows` |
| Attribute rules or projection | `tests/authorization/attributeRuleOrdering`, `listFilter`, `tests/services/grants/grantHolderAttributes`, `src/utils/expression/index.test.js` |
| Paths SQL or a list query | `tests/model/pathsArm`, `listsArm`, `listRowsArm`, `tests/services/grants/listVisibility` |
| Standing or badges | `tests/model/standingArm`, `badgeCoverage` |
| A state rule | `tests/state/rules`, `sync`, `tests/model/transitionsArm` |

## Keeping this current

When a session hits engine behaviour this page does not explain — an injection point that was
not obvious, a filter that returned something unexpected, a hydrator that never ran — amend
this file in the same change. Verify a claim by running the suite or the live app before
writing it down. Put the explanation in
[docs/contributing/techniques/authorization-engine.md](../../../docs/contributing/techniques/authorization-engine.md)
and keep only the rule or trap here.

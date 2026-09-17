# Notes: authorization engine read-through (2026-09-14/15)

> **Superseded in part by Phase 4 of the access-model plan, 2026-09-15.** These notes record the
> code as it was read. Since then:
> - The builtin dataset, collection, and group terms read one context attribute, `access_paths`,
>   from `accessPathsQuery`. The context attribute `active_grant_access_types` and the user
>   facts `effective_group_ids` and `accessible_owner_group_ids` are gone.
> - `userDatasetsQuery`, `userCollectionsQuery`, `accessibleDatasetIdsByGrantsQuery`,
>   `accessibleCollectionsByGrantsQuery`, `ownerGroupIdsOfResourcesAccessibleByUserQuery`,
>   `getUserDatasetGrants`, and `explainDatasetAccess` are deleted. `getGrantAccessTypesForUser`
>   and `userHasGrant` live in `services/grants/holdings.js` and read `accessPathsQuery`.
> - The grant terms read `resource_owner_group_id` from the grant hydrator, and no `evaluate` is
>   async.
> - List handlers call `callerIsPlatformAdmin(req)`, which reads `user_role`.
> - `group.members`, `collection.datasets`, and `dataset.collections` read the active views.
> @see docs/design/groups/access-model.md — The rule is a query
>
> **Superseded further by Phase 3 of the restrictions plan, 2026-09-15.** Every finding below
> about the restriction layer records a layer that no longer decides anything. `checkRestriction`
> returns null for every action; `RESTRICTION_TYPES`, `typeBlocks`, `blockedActions`,
> `effectiveRestrictionTypes`, `restrictionTypesByTarget`, `blockingRestriction`,
> `restrictionTargetFor`, and `RestrictionTargetError` are gone, as are `isRestricted`,
> `applyRestriction`, `liftRestriction`, and `restrictionHistory`. Archiving and deletion are
> resource state, declared per resource under `src/state/builtin/` and asserted by each service
> inside its transaction, after its row lock, answering 409 rather than 403. The reading of
> `effective_restriction` recorded here — its four arms, its `group_closure` join, and the
> descendant reach that follows from it — was accurate when taken and is the premise decision D2
> reversed: archiving now covers a group and what it owns, one step, and a sub-group keeps its
> own state. The transition table is not gone: `access-model.md` still specifies it, and the
> per-resource state rules under `src/state/builtin/` are where it is now enforced.
> @see docs/design/groups/access-model.md — The state check

Purpose: understand the engine and its tests fully before revising the access-model plan.
Update after each file. Re-read before the next. Organised by theme (my choice), with file refs.

## Status
Read: READMEs (3), core/policies/* (3), core/hydrators/* (5), core/hydrationUtils.js,
core/authorize.js, core/attributeFilters.js, core/capabilities.js, core/middlewares.js,
core/index.js (barrel: exports classes, authorizeWithFilters, capability fns, attribute filter
fns, middleware factory; NOT filterRestrictedCapabilities or AuthorizationError).
builtin/policies/utils/index.js, builtin/policies/base_attributes.js, builtin/policies/dataset.js,
builtin/policies/collection.js, builtin/policies/group.js, builtin/policies/{grant,access_request,
user,audit}.js, builtin/hydrators/* (5), builtin/restrictions.js, builtin/audit/* (5),
authorization/index.js. ALL engine source read.
Remaining source: callers (app.js, route files, service files; map with grep first).
Remaining tests (16,916 lines total):
- tests/authorization: core/authorize (502), core/hydrators/PrismaHydrator (436),
  core/middlewares (343), core/policies/Policy (463), dataset.attribute_filters (80),
  dataset.contribute (112), grantHydrator (81), platformAdminShortCircuit (168),
  public_router (85), route_policy_bindings (148).
- tests/services shared: helpers.js (349), concurrency-utils.js (89).
- access-requests: access-summary 382, concurrency 562, create-and-submit 146, expiry-cron 118,
  invariants 511, lifecycle 756, notifications 143, presets 877.
- audit/resourceAuditRecords 140. collections: concurrency 264, invariants 225, lifecycle 340.
- datasets: attribution 251, delete 176, eligible-owner-groups 166, name-available 129,
  owner-group 230, upload-status-filter 126, use-conditions 219, workflow-gating 151,
  workflows-and-downloads 322.
- grants: accessTypeClosure 267, anonymousSubjectSet 132, coverage 231, derivedIndependence 184,
  grantHolderAttributes 88, grants.{concurrency 343, invariants 419, lifecycle 521},
  issueGrants.{concurrency 468, invariants 225, lifecycle 509}, listVisibility 195,
  owningGroupGrant 269.
- groups: concurrency 260, hierarchy 115, invariants 290, lifecycle 533, no-active-admins 121.
- imports: dataset.import 192, import_sources 272. invitations: email 219, hook 262, service 403.
- nonce 52, system_accounts 221. profiles: profileColumns 131, profileUpdate 195,
  viewProfile 246. restrictions 314. uploads/dataset.upload_v2 149.
Order: finish source + callers, then tests/authorization, then tests/services helpers first.

## 1. Layers and extension
- core/ framework ("never edit in derived apps"); builtin/ bioloop's policies and hydrators;
  custom/ empty here (.gitkeep), documented extension point for derived apps (forks). A derived
  app adds a PolicyContainer + PrismaHydrator and registers them in index.js Sections 3-5.
- Written invariants: policies are pure functions over declared attributes; hydrators own all
  fetching; request-scoped cache; call sites know nothing of policy internals.
- A policy is unit-testable with plain objects and no DB (core/README states this as a value).

## 2. Policy and composition (Policy.js)
- `new Policy({name, resourceType|null, requires:{user,resource,context}, evaluate})`,
  validated at construction (= module load = boot).
- `evaluate()` throws (not denies) when a required attribute is absent (`attr in obj`).
- `or/and/not` are CLOSURES: result keeps unioned `requires` and a looping `_evaluate`; children
  are not stored. Structure is unrecoverable after composition. or/and short-circuit.
- Combinator children must share one non-null resourceType. `Policy.always/never` are null-typed.

## 3. Containers and registries
- PolicyContainer: `actions(map)` clones each policy renamed `<type>.<action>` (the `or(a,b)`
  name is overwritten). `attributes(map)` validated at boot (array of {policy, non-empty string
  filters}, resourceType match). `roles(array)` validated at boot. `freeze()`.
- `getAttributeRules(action)`: action key, else '*', else [].
- `getRoleDerivationPolicy()`: first matching role; its JSDoc says "multiple roles may be
  assigned (all matching policies apply)" -> doc/code disagree.
- PolicyRegistry: Map, unique type, `get` throws. No iteration API; no frozen check.
- HydratorRegistry: Map, unique type, `get` lazily builds a default hydrator via a factory
  (request time), `listTypes()`.

## 4. Hydration (PrismaHydrator.js, hydrationUtils.js)
- `hydrate({id, attributes, cache, preFetched})` per entity: cache key `${id}` or 'global';
  preFetched is structuredClone'd and merged without overwriting cache; fetch only uncached
  attributes; classify virtual > unknown > relation > column; unknown -> HydrationError at
  REQUEST time; one `findUniqueOrThrow` for columns/relations; virtual loaders in parallel with
  `{id, recordCache, hydrator}`; returns the mutable record cache.
- `registerVirtualAttribute` validated at boot, may not shadow a model field.
- `resolveHydrators(registry, policy)`: user + context always; resource hydrator from
  policy.resourceType (null -> resource `{}`).
- `hydrateEntities`: one Promise.all over user/resource/context with the policy's (unioned)
  requires -> every branch of an `or` hydrates before evaluation.
- Context id = object `{...identifiers, resourceType}`; authorize.js relies on it being a stable
  cache key across phases -> context hydrator must key by content (verify in context.js).
- User virtual attributes describe the user, so they load once per request and serve all rows.

## 5. Decision flow (authorize.js, attributeFilters.js)
- Only export: `authorizeWithFilters({policy, attributeRules, identifiers, registry,
  policyExecutionContext, preFetched, events})`. No boolean `authorize()` exists -> README
  examples stale.
- Request-time validation; `identifiers.user` required (slug-route error text).
- Phase 1: hydrate + evaluate action policy. Deny -> `{granted:false, filter:null}` + event.
- Phase 2: attribute rules evaluated in order with the ACTION policy's hydrators and incremental
  hydration per rule; first match returns its filters; no match -> [] ->
  `createFilterFunction([])` returns `() => ({})` (empty object, the skill's trap).
  Non-empty -> `projectObject(obj, filters)` from `@/utils/expression` ('*', '!x', dot paths).
- Events carry `{policy, identifiers, granted, context}` (full hydrated context).
- No restriction or platform-admin logic in core/authorize.js (injected elsewhere).
- Capabilities (capabilities.js) use the same "hydrate once, evaluate many" pattern:
  `evaluateCapabilitySet({policyContainer, identifiers, hydratorRegistry, policyExecutionContext,
  preFetched, actionNames=all})` builds `Policy.or(allActionPolicies)` only to get the unioned
  requires, hydrates once, then evaluates every action policy in memory (Promise.all) ->
  `{action: boolean}`. `deriveCallerRole` does the same with the container's role-derivation
  policy -> role string or null. `toCapabilitiesArray` keeps the true keys.
  Consequences: (a) one action whose requires cannot hydrate makes the WHOLE capability set
  throw, so a single bad policy 500s every detail page that asks for capabilities (non-admins);
  (b) no restriction filtering here (middleware does it); (c) the docstring is stale (says it
  calls authorize() per action; mentions a `datasetGrantTypes` preFetched context).
  `CapabilityEvaluationError` for bad inputs.

## 5b. Request pipeline (middlewares.js)
- `initializePolicyContext(req,res,next)`: creates `req.policyContext.cache.{user,resource,
  context}` Maps once per request and seeds the user cache with `req.user` keyed by
  `subject_id` (the mutable-object trap). Only seeds if `req.user` exists at that point, so its
  position relative to `authenticate` in app.js matters (check).
- `createAuthorizationMiddlewareFunction(policyRegistry, hydratorRegistry, events,
  restrictionChecker?, platformAdmin?{policy, callerRole})` returns curried
  `authorize(resourceType, action, {requesterFn=req.user, resourceIdFn=req.params.id,
  preFetchedResourceFn, shouldDeriveCapabilities, shouldDeriveCallerRole})`.
  At route DEFINITION: `policyRegistry.get(type)`, `getPolicy(action)`, `getAttributeRules`
  -> unknown type/action is a BOOT failure (CONFIRMED). Sets `middleware.authorizes =
  {resourceType, action}` so route_policy_bindings.test can read the router stack.
- Per request, in order:
  1. identifiers `{user: requester.subject_id, resource: resourceIdFn(req)}` (default is
     req.params.id, so for /grants/:id the "resource" id is the grant id).
  2. restrictionChecker({resourceType, action, resourceId, preFetchedResource}) -> 403
     `Blocked by a <TYPE> restriction`.
  3. platform admin: authorizeWithFilters(platformAdmin.policy, ALL_ATTRIBUTES=[always,'*'],
     preFetched {user: req.user, resource, context: {req}}). If granted: req.permission;
     capabilities = every action true, then restriction-filtered; callerRole =
     platformAdmin.callerRole; next(). NO `events` passed on this path, so platform-admin
     decisions emit no decision event.
  4. otherwise authorizeWithFilters(action policy, rules, same preFetched, events) -> 403
     'Forbidden' on deny (not 404).
  5. if asked: evaluateCapabilitySet (NOT given preFetched; relies on the shared cache), then
     `filterRestrictedCapabilities` (sequential restrictionChecker per true action; reads skip DB);
     deriveCallerRole.
- Context preFetched is `{ req }`: the whole Express request goes into the context hydrator.
  PrismaHydrator would structuredClone it (would throw), so context hydrator must differ (check).
- Hydration/policy errors propagate through asyncHandler -> 500.

## 7. Builtin policy layer (builtin/policies/*)
Shared pieces:
- `isPlatformAdmin` (utils): resourceType null, requires `user.roles`, true iff roles includes
  'admin'. Injected into the engine; action policies must not name it (decision 11).
- `platformAdminOnly` (utils): resourceType null, requires nothing, always false. Marks actions
  nobody qualifies for except through the short-circuit.
- `base_attributes.js` (frozen): the "public" field lists attribute rules build on.
  - group: id, name, slug, description, metadata.type, is_archived, _count.members.
    Uses `description`, not tagline/about_md (the UI stopped showing description; possible drift).
  - collection: id, name, slug, description, metadata, created/updated_at, is_archived,
    owner_group_id, _count.datasets, plus `owner_group.<group fields>`.
  - dataset: id, name, type, description, size, bundle_size, is_deleted, is_staged, created/
    updated_at, owner_group_id, resource_id, plus `owner_group.<group fields>`. Comment explains
    what is withheld (metadata, num_directories, du_size, num_files, src_instrument_id, paths).
  - user: id, name, email, username, is_deleted, subject_id.
  - grant: '*' plus nested prefixed lists for resource.collection/dataset, subject.user/group,
    grantor, revoker. Whether '*' already exposes nested objects wholesale depends on
    projectObject semantics (check the expression tests).
- Field lists are data. They are reused across rules and are the natural unit for any per-row
  projection on lists.

Pattern per container: a `<Type>Policy extends Policy` subclass pins resourceType; named "terms"
are module constants; `.actions({...})` composes them with Policy.or; `.attributes({...})` lists
ordered rules; `.roles([...])` lists ordered role rules; `.freeze()`.

The three kinds of fact a term reads (dataset.js makes this clear):
- USER facts, independent of the resource: `group_memberships`, `oversight_group_ids`,
  `effective_group_ids`, `roles`. Loaded once per request.
- RESOURCE columns / virtuals: `owner_group_id`, `owner_group_allows_contributions`.
- CONTEXT facts, per (user, resource): `active_grant_access_types` (a Set, already closed over
  the access-type order per the roles() comment).
A term of shape "user-fact contains resource-column" (admin, oversight, contributor) compiles to
SQL by substituting the user fact as a parameter: `owner_group_id = ANY($adminGroupIds)`. Only
context terms (grants) need a real SQL fragment. That is a much smaller compiler than the plan
assumed.

dataset.js specifics (419 lines):
- Terms: `isDatasetOwningGroupAdmin` (group_memberships has ADMIN row for owner_group_id);
  `hasDatasetOwningGroupOversight` (oversight_group_ids includes owner_group_id);
  `isDatasetOwningGroupContributor` (owner_group_allows_contributions && effective_group_ids
  includes owner_group_id); `userHasGrant(type)` factory -> `context.active_grant_access_types
  .has(type)`, name `userHasGrant(<TYPE>)`, and it THROWS AT CONSTRUCTION for a type not in
  `GRANT_ACCESS_TYPES` constants (a boot-time check that already exists).
- 23 actions as mapped before; `list: Policy.always` (comment: service layer filters);
  `edit: platformAdminOnly`; read_data/download/compute/remote_access exclude oversight;
  request_stage = admin | DOWNLOAD | COMPUTE; view_audit_logs/workflows/collections = admin |
  oversight. No Policy.not.
- Attribute rules '*' in order: admin ['*']; oversight PUBLIC + num_directories, num_files,
  du_size, src_instrument_id, metadata (no paths); grant VIEW_SENSITIVE_METADATA PUBLIC + same +
  origin/archive/staged paths; grant LIST_FILES PUBLIC + num_files; grant VIEW_METADATA PUBLIC.
  `list`: always PUBLIC ("even for structural roles"). view_source/derived_datasets: admin '*';
  oversight PUBLIC; matching grant PUBLIC.
- FIRST-MATCH CONSEQUENCE: an overseer who also holds VIEW_SENSITIVE_METADATA matches the
  oversight rule first and gets no paths, although the grant alone would show them. Same shape
  as the first-match caller role. A union of matching rules would not lose it.
- Roles: ADMIN (admin), OVERSIGHT (oversight), GRANT_HOLDER (VIEW_METADATA, i.e. any grant).

collection.js specifics (221 lines):
- Terms mirror dataset: `isCollectionAdmin`, `hasCollectionOversight`, `userHasGrant(type)`
  (validated at construction, but NAMED just 'userHasGrant' for every type -> indistinguishable
  in names/exports). New kinds: `isProfilePublic` (resource `profile_visibility === 'PUBLIC'`, no
  user attributes, so an anonymous caller can satisfy it) and `isProfileVisibleToSignedInUser`
  (user `is_anonymous !== true` and visibility PUBLIC|AUTHENTICATED).
- Actions (16): create admin; view_metadata admin|oversight|grant VIEW_METADATA; view_profile =
  that | isProfilePublic | isProfileVisibleToSignedInUser; list always; list_datasets
  admin|oversight|grant LIST_CONTENTS; edit_metadata, add_dataset, remove_dataset,
  transfer_ownership, delete, archive = admin; unarchive platformAdminOnly; list_grants,
  view_audit_logs = admin|oversight; manage_grants, review_access_requests = admin.
- `CallerRole` enum has MEMBER, never produced by roles().
- Attribute lists defined LOCALLY: `PUBLIC_ATTRIBUTES` (includes tagline, omits owner_group_id,
  pulls group.js PUBLIC_ATTRIBUTES) differs from `base_attributes.collection` (used by grant
  attributes). Two "public collection" lists -> drift. Also `PUBLIC_PROFILE_ATTRIBUTES`
  (no `_count.datasets` on purpose, comment explains anonymous disclosure) and
  `PROFILE_ATTRIBUTES`.
- Attribute rules: '*' admin ['*']; oversight ['*'] (unlike datasets, overseers see every
  collection field); grant VIEW_METADATA PUBLIC + PROFILE. view_profile: or(admin, oversight)
  ['*'], grant, always PUBLIC_PROFILE. list: always PUBLIC with the comment "we can't uniformly
  apply the attribute filters because different collections in the list might have different
  permissions" -> per-row list projection is a known, stated limitation.
- collection.js requires group.js (for group PUBLIC_ATTRIBUTES).

group.js specifics (273 lines):
- Terms: `isGroupAdmin` (group_memberships has ADMIN row for group.id, direct only);
  `isGroupMember` (effective_group_ids includes group.id; effective = direct plus membership of
  any descendant); `hasGroupOversight` (oversight_group_ids); `canAccessResourcesOwnedByGroup`
  (user fact `accessible_owner_group_ids`: groups owning some resource the user holds a grant on);
  `isMemberContributionsAllowed` (ONLY the resource column allow_user_contributions, no
  membership term); `isProfilePublic`, `isProfileVisibleToSignedInUser` as in collection.
- EVERY group term reads a user fact or a resource column. None reads a context fact. So a group
  list filter compiles entirely by parameter substitution.
- Actions (21): create platformAdminOnly; create_child admin; archive admin; unarchive
  platformAdminOnly; view_metadata member|oversight|resourceAccess; view_profile adds admin,
  public, signed-in; edit_metadata admin; list always ("database query will contain filters");
  view_hierarchy, list_invalid platformAdminOnly; view_audit_logs admin|oversight;
  view_members, view_ancestors member|oversight; view_descendants admin|oversight;
  add_member, remove_member, edit_member_role, invite, view_invitations admin (comments explain
  invite vs view_invitations split exists for ARCHIVED); add_dataset admin|contributionsAllowed;
  add_collection admin.
- Roles: ADMIN, OVERSIGHT, MEMBER, RESOURCE_ACCESS (first match).
- Attribute rules '*': admin ['*']; oversight ['*']; member PUBLIC+PROFILE+created_at,
  allow_user_contributions, `ancestors[*].{id,name,slug,description,is_archived,depth,metadata}`,
  `admins[*].{id,name,email,username,subject_id}`; resourceAccess PUBLIC. view_members:
  or(admin,oversight) ['*']; member ['*','!assignor','!assigned_by']. view_profile: or(admin,
  oversight) ['*']; member (subset incl. admins email); always PUBLIC_PROFILE + admins id,name.
  list: always PUBLIC + created_at, allow_user_contributions, user_role, depth, path -> the
  SQL-computed `user_role` is part of the list response contract.
- Projection syntax in use: `[*]` array paths and `!field` exclusions.
- Local PUBLIC_ATTRIBUTES includes tagline, avatar_key; base_attributes.group does not -> the
  same drift pattern as collection.

grant.js (151 lines), access_request.js (129), user.js (47), audit.js (34):
- These four govern records ABOUT other resources (grant, access_request) or the whole system
  (user list, audit). None has roles(). No Policy.not anywhere in builtin (question closed).
- grant terms: `isAdminOfResourceGroup` and `hasOversightOfResourceGroup` declare
  resource `['resource_id','resource_type']` but their `evaluate` is ASYNC and calls
  `datasetService.getDatasetById` / `collectionService.getCollectionById` to find the owning
  group. So the owning group is a hidden read: not in `requires`, not hydrated, not cached, and
  refetched per term (capabilities run both terms per action in Promise.all). Unknown
  `resource_type` throws -> 500. `isSubject` (USER subject, subject_id match; the comment
  records a fixed bug where it compared the integer id to the UUID), `isAdminOfSubjectGroup`,
  `hasOversightOfSubjectGroup` (GROUP subject). No term for a plain MEMBER of the subject group:
  members cannot list their group's grants.
- grant actions (7): create, revoke = admin of resource group; read, list_for_resource =
  admin|oversight of resource group; list_for_subject = subject|admin/oversight of subject
  group; view_coverage = any of the five; list = always. Attributes '*': always
  `base_attributes.grant`.
- access_request terms: `isRequester` (subject_id == requester_id); `isAdminOfResourceGroup`,
  `hasOversightOfResourceGroup` read the relation `resource2.{dataset,collection}.owner_group_id`
  (declared, hydrated; same names as grant.js's terms, different reads). Actions (4): read =
  requester|admin|oversight; review = admin; update = requester; create = always (comment: the
  route authorizes view_metadata on the target; this binding exists so the ARCHIVED restriction
  reaches creation via preFetched). Attributes '*': always ['*']. A commented-out
  `canCreateAccessRequest` remains. Request STATE (draft/submitted/...) is not in any policy;
  the lifecycle's who-may-act-when lives in services.
- user.js: one action `list: isAdminOfAnyGroup` (user fact only). NOT frozen.
- audit.js: `read_records: platformAdminOnly`, no attribute rules. NOT frozen.

## 8. Builtin hydrators (builtin/hydrators/*, 310 lines)
Explicit hydrators exist for user, dataset, grant, access_request, and context. collection and
group have none, so they get the lazy default PrismaHydrator (confirm in index.js).
- context.js is NOT a PrismaHydrator: `ContextHydrator extends Hydrator`, virtual loaders only.
  Cache key `${user}:${resourceType}:${resource}` -> no collision across rows (question closed).
  preFetched seeds only attributes that are both requested and present, and never clones; the
  middleware's `{ req }` is therefore unused unless a policy names `req`. One loader:
  `active_grant_access_types` -> `grantService.getGrantAccessTypesForUser(user, resource,
  TYPE)`; returns an empty Set when any identifier is missing (fail-closed). Docstring: direct
  USER grants, GROUP grants via transitive membership, dataset via containing collections.
  Unknown context attribute -> HydrationError (request time). `console.debug` per load.
- user.js (idAttribute subject_id). Virtuals, each a DB VIEW read:
  - `roles`: user_role -> role names (comment: routes pre-fetch req.user with roles, so this
    loader rarely runs; it had a wrong relation name for a long time).
  - `group_memberships`: `active_group_user` view (removed and past valid_until excluded).
    So the ENGINE honours valid_until while `groupService.isGroupAdmin` and access_requests
    read group_user with removed_at only -> confirmed disagreement between engine and services.
  - `effective_group_ids`: `effective_user_groups` view (direct groups plus their ancestors).
  - `oversight_group_ids`: `effective_user_oversight_groups` view (strict descendants of
    administered groups; comment gives the A->B->C example).
  - `accessible_owner_group_ids`: `grantServices.ownerGroupIdsOfResourcesAccessibleByUserQuery`.
  - `is_anonymous`: always false; the anonymous principal is pre-fetched with true.
- dataset.js (idAttribute resource_id): virtual `owner_group_allows_contributions` (joins
  owner_group; the comment says it exists to keep the policy pure).
- grant.js (idAttribute id): virtual `resource_type` from grant.resource.type. Comment: routes
  with a pre-fetched grant supply it; revoke has only an id. The owning GROUP is still not a
  virtual (policy fetches via services, item 22).
- access_request.js: virtual `resource2` = resource row with dataset and collection included
  (comment records a `has` vs `some` bug that 500'd every non-admin request action).
- Recurring bug shape in comments: a loader that is wrong fails only at request time, on the
  first path that happens to hydrate it (roles relation name, `has` vs `some`, unknown
  resource_type, isSubject id type). All four were request-time 500s a boot check or a
  per-attribute smoke test would catch.

## 9. Restrictions (builtin/restrictions.js, 284 lines)
- Rule stated in the header: allowed = no restriction blocks AND some grant permits.
- `MUTATING_ACTIONS` (36) and `READING_ACTIONS` (36) are hand-written sets of qualified action
  names. The comment says a test asserts every registered action is in exactly one. Count: 72,
  but 73 actions are registered. `audit.read_records` is in NEITHER (check the restrictions test:
  does it skip audit, or does the test enumerate only some containers?).
- This is ALREADY an action table keyed by `<type>.<action>`, hand-written, with a coverage test.
  The plan's proposed action table has a precedent and a place to live.
- `ARCHIVED_EXEMPT_ACTIONS` = the three unarchive actions. `BLOCKED_ACTIONS_BY_TYPE.ARCHIVED` =
  mutating minus exempt. `typeBlocks`: unknown type blocks nothing (documented fail-open).
- `effectiveRestrictionTypes({group_id|resource_id})` reads the `effective_restriction` VIEW
  (follows the group tree). Another derived relation that already lives in SQL.
- `blockingRestriction` skips the query when no type could block the action (all reads).
- `restrictionTargetFor`: group -> group_id; dataset/collection -> resource_id; grant and
  access_request -> `preFetchedResource.resource_id` else null; other types null. null ->
  allowed (the known fail-open, T11). The comment's own per-subject note: a future DUA
  restriction blocks reading per person, and this map is not per subject.

## 10. Entry point (authorization/index.js, 249 lines)
- Registers 7 containers and 5 hydrators; collection and group use the lazy default
  PrismaHydrator (confirmed). SECTIONS 3-5 for derived apps are empty.
- `createAuthorizationMiddlewareFunction(..., events = undefined, ...)`: NO decision event
  consumer exists. `AUTH_EVENT_TYPE.ACCESS_CHECK` is defined in audit/events.js but nothing
  wires it (open question closed, pending a grep for ACCESS_CHECK).
- `authorizeAction(type, action, {identifiers, preFetched, shouldDerive*})` is a SECOND pipeline
  for non-route callers. Same order (restriction -> platform admin -> policy -> capabilities ->
  role) but re-implemented, and it differs: capabilities are NOT restriction-filtered on either
  branch (the middleware filters both); its policy lookup is at call time, not boot. Two copies
  of the pipeline = drift. Find its callers.
- No static checks run at module load beyond constructors.

## 11. Audit module (builtin/audit/*, 651 lines)
- Not part of decisions. `AuditBuilder` writes `authorization_audit` rows from services
  (target/subject/resource plus resolved names). `AUTH_EVENT_TYPE` enumerates lifecycle events
  (grant, request, group, collection); none for datasets, invitations, or restrictions directly.
  `TARGET_TYPE` lacks DATASET; `SUBJECT_TYPE` is {USER, DATASET}, which does not match
  subject.type {USER, GROUP}.
- helpers swallow errors and return null / empty Map (fallback, against "refuse rather than
  fall back").
- DEFECT: `resolveEntityName(tx,'grant',id)` selects `access_type` and `resource.type` but reads
  `grant.grant_access_type.name` and `grant.resource.resource_type`, so every grant target name
  is "Unknown on Unknown for User|Group". File in .todo (L2) after checking callers pass names.
  *Fixed 2026-09-17: the reads now match the select. Rows written before the fix keep the
  old name.*
- Relevance to the plan: audit rows are the operation log; the plan's operation-effects table
  can assert one audit row per effect, but the audit module has no model role.

## 6. Boot-time vs request-time checks (so far)
Boot: Policy shape; container attribute/role rule shape; registry uniqueness; hydrator model
exists (explicit hydrators); virtual attribute name validity; `authorize(type, action)` route
factory resolves container+action (CONFIRMED in middlewares.js).
Request: unknown required attribute (HydrationError 500); missing attribute on evaluate (throw);
default hydrator model missing; identifiers shape.
Not checked anywhere yet seen: attribute-rule keys name real actions; action policy resourceType
matches container; containers frozen; every action has attribute rules.

## Stale documentation
- All three READMEs: positional `authorize()` / `authorizeWithFilters()`, `POLICY_REGISTRY`
  object; custom example names `isPlatformAdmin` in policies (decision 11 forbids in builtin).
- PolicyContainer.roles() JSDoc (multiple roles) vs first-match implementation.

## Implications for the plan doc
1. Derived apps are unmentioned in the plan. custom/ must be able to add types, terms, and
   hydrators without editing core/builtin.
2. Pure JS policies are a written invariant and a testability value. Any SQL form is an optional,
   additive compilation, never the definition.
3. Lists need SQL because filtering must precede LIMIT/OFFSET/COUNT, NOT because JS is slow per
   row (user facts are cached per request). The plan's stated reason is wrong.
4. Composing SQL from an action policy needs the or/and/not tree, which Policy.js discards. That
   is a core/ change (store op + children).
5. A decision is (granted, filter chosen by first-match rule list). Replacing caller_role with a
   set of paths must keep attribute rules working; rules share the action's resourceType.
6. Framework intent already said "multiple roles"; a set-valued standing matches it.
7. Boot-time checks worth adding: requires vs schema/virtual attributes (no DB needed, reuse
   `_classifyAttributes`); attribute-rule keys; action resourceType; frozen containers; needs a
   PolicyRegistry iteration API.
8. Decision event carries the hydrated context; find its consumer before changing context shape.
9. The engine already batches: all actions for one resource share one hydration pass. What it
   cannot do is choose rows for a page. So a list compiler is the only missing piece; capability
   and standing computation can stay in JS over the hydrated facts.
10. Capabilities fail as a unit. A boot-time requires check (item 7) protects every detail page,
    not just the one route that uses the bad action.
11. The engine's outer layers are exactly two injected checks: restriction, then platform admin.
    A list compiler must reproduce both: platform admin -> no row filter; restrictions never
    affect reads today. Anything else the plan adds to "the decision" is new engine surface.
12. Denial is 403 on detail routes. design.md says resource existence is access-controlled
    ("cannot know the resource exists"); a 403-vs-404 difference leaks existence. Record as a
    finding, not a plan change, unless routes already map it (check callers).
13. The route factory resolves actions at boot, and exposes `middleware.authorizes`. That is the
    existing hook for boot/CI checks over route bindings; new static checks can use the same.
14. A list compiler can be partial evaluation, not a new rule language: user facts become SQL
    parameters, resource columns stay columns, and only context-fact terms (grants) need a
    hand-written SQL fragment. Keep each term's JS form; add an optional `sql` only where a term
    reads a context fact. (dataset.js)
15. First-match loses information in TWO places: caller role and attribute rules. The
    overseer-with-sensitive-grant case is a concrete instance for attributes. Any standing/paths
    redesign should decide union semantics for both at once. (dataset.js)
16. `userHasGrant(type)` already validates access-type names at boot against constants. Extend
    the same pattern rather than inventing a new static-check mechanism. (dataset.js)
17. Some terms read only resource columns (profile visibility) or only session facts
    (is_anonymous). Both compile to SQL trivially, and they are how anonymous access works. A list
    compiler must treat the anonymous principal as a first-class caller. (collection.js)
18. The code already states that lists cannot project per row. Per-row projection is optional
    future work, not something the plan must deliver. (collection.js)
19. Attribute lists and term names drift: two public-collection lists; collection
    `userHasGrant` is unnamed by type. A boot check for unique term names within a container
    would catch the latter. (collection.js)
20. Group access needs no context fact: every term is user fact vs resource column. Datasets and
    collections need exactly one context-fact term, `userHasGrant`. So the SQL that must be
    hand-written is one fragment per grantable resource type ("does this subject set hold a type
    satisfying T on this resource, directly or via a containing collection"), which already
    exists as `accessibleDatasetIdsByGrantsQuery` / `accessibleCollectionsByGrantsQuery`.
    (group.js)
21. Attribute rule lists are ordered most-privileged-first everywhere, and the comments say so.
    Where each earlier list is a superset of the later ones (group), first-match is harmless;
    where it is not (dataset: oversight vs sensitive grant), it loses fields. A static check can
    detect non-superset orderings at boot. (group.js vs dataset.js)

22. The "pure function over declared attributes" invariant is already broken in builtin:
    grant.js's resource-group terms fetch through services inside `evaluate`. `requires`
    under-declares what they read, so neither a static check nor a compiler can see it. A
    design that relies on `requires` as the full fact list must first move this read into a
    grant hydrator virtual attribute (e.g. the owning group id). A boot check can flag async
    `evaluate` functions (constructor.name === 'AsyncFunction'). (grant.js)
23. Unfrozen containers exist today (user.js, audit.js), so the "containers frozen" boot check
    would fail on first run. (user.js, audit.js)
24. Term names are local to a container: `isAdminOfResourceGroup` means different reads in
    grant.js and access_request.js. Design tables must qualify term names by container.
25. Grant and access_request access derives from the target resource's owning group through a
    join. That still compiles by parameter substitution plus one join; no context fact needed.
26. Workflow state (access request status, grant revoked/expired) is outside the engine. For the
    plan's "all states and transitions", the state machine lives in services, so its tests
    belong to services, and the engine sees only identity facts. (access_request.js)
27. The derived relations the plan names already exist as database views: `active_group_user`
    (active), `effective_user_groups` (effective_member), `effective_user_oversight_groups`
    (oversees). User facts are SELECTs from these views. So a list filter can either pass the
    user fact as a parameter or join the view directly; both keep one SQL definition per
    relation. The plan should name these views as the single definition of "current state".
    (hydrators/user.js)
28. Engine and services disagree on membership today: the engine reads `active_group_user`
    (valid_until honoured), some services read `group_user` with removed_at only. This is a
    concrete Agreement failure the harness must cover. (hydrators/user.js)
29. `userHasGrant` has one JS path, `getGrantAccessTypesForUser`, and lists use
    `accessible*ByGrantsQuery`. Whether these share SQL decides whether grant terms already have
    one definition (check services/grants).
30. Every hydrator bug recorded in comments was a request-time 500 on the first path that
    hydrated the attribute. A boot or CI smoke check that hydrates every declared attribute of
    every policy against a seeded row would have caught all four. Add it to the plan's harness.
31. An action table already exists: `MUTATING_ACTIONS` / `READING_ACTIONS` with a coverage
    test. The plan should extend that table (add columns) rather than invent a new one, and the
    coverage test is the model for "every registered action appears". (restrictions.js)
32. `effective_restriction` is a view too. With item 27, every derived relation in the plan
    except grant holding already has one SQL definition. (restrictions.js)
33. The engine pipeline exists twice: the middleware and `authorizeAction`. They already differ
    on restriction filtering of capabilities. The plan's "one definition" target must cover the
    pipeline, not just the rule: one function both call. (index.js)
34. No decision events are emitted anywhere, so changing the hydrated context shape breaks no
    consumer (item 8 resolved). (index.js)
35. Restrictions are per-target, not per-subject. The comment already names the per-subject DUA
    case as the seam to re-examine. The plan's `restriction` base relation should say it is
    (type, target) today. (restrictions.js)
36. The UI persona `/me.uiPersona` is a third role derivation, outside the engine, using a
    service that disagrees with the engine on membership. It is the persona the plan says goes.
    (users_v2)
37. Action names are also chosen by config (`policyActionFor`), so "every route binding names a
    registered action" is not fully a boot-time fact; the workflow map needs its own check.
    (workflows.js)
38. 403-vs-404 is already decided per router: 404 on `/public`, 403 elsewhere. The plan should
    state which is intended for signed-in detail routes rather than record it as a leak by
    default. (public.js)

## 12. Caller map (grep, 2026-09-15)
- app.js:72 `app.use(initializePolicyContext)` runs BEFORE `authenticate`, which is mounted
  inside routes/index.js:24. So `req.user` is never present when the context is created, and the
  user-cache seeding in initializePolicyContext is dead code. The user reaches the engine only
  as the middleware's `preFetched.user` (open question closed).
- `/public` is mounted before `authenticate` (profiles, anonymous principal).
- Middleware `authorize(` counts: groups 25, collections 14, datasets_v2/index 13, grants 12,
  access_requests 7, datasets_v2/files 6, public 4, workflows 3, audit 1, users_v2 1.
- `authorizeAction` (second pipeline) callers: groups.js:253 (view_metadata),
  collections.js:227 (dataset.request_stage), access_requests.js:136 (view_metadata on the
  target, the create path), workflows.js:127, datasets_v2/index.js:73/123/186 (contribute),
  :507 (create).
- `services/datasets_v2/index.js` imports `userHydrator` directly (service reads user facts,
  likely to parameterise list SQL -> the partial-evaluation pattern may already exist; read).
- collections route imports `base_attributes.dataset` directly (route-level projection).
- Audit: AuditBuilder used by 9 services. `ACCESS_CHECK` is defined and never emitted
  (item 34 confirmed). grants/index.js:52 `setTarget('GRANT', id)` with no name, so the
  resolveEntityName grant defect reaches real audit rows (confirmed path).
- restrictions.test.js 'covers every registered policy action exactly once' HARD-CODES six
  resource types and omits `audit`, because PolicyRegistry has no iteration API. So
  `audit.read_records` escapes classification, and any container a derived app adds would too.
  The comment's "a new action cannot be forgotten" holds only for actions in those six.

## 13. Routes, small files (public 136, audit 59, users_v2 74, datasets_v2/files 155,
## datasets_v2/workflows 167)
Common pattern: `authorize(type, action, {resourceIdFn})` before the handler; sub-routers pass
`resourceIdFn: req.params.dataset_id` (the `byDatasetId` constant appears in two files).
Handlers mostly ignore `req.permission.filter` unless they return the resource itself.
- public.js: `optionalAuthenticate` then `authorize('group'|'collection','view_profile')`;
  `hideRefusals` maps 403 -> 404 on this router only, with the comment that a 403 confirms
  existence. Handler returns `req.permission.filter({...group, admins})`. Rate limit 60/min,
  cache 300 s. So item 12 is handled for anonymous routes and NOT for signed-in detail routes.
- audit.js: `authorize('audit','read_records', {resourceIdFn: () => null})`.
- users_v2 `/me`: `uiPersona` = platform_admin | group_admin | standard_user from
  `auth.isPlatformAdmin(req)` and `groupService.isGroupAdmin(subject_id)`. Computed OUTSIDE the
  engine, from the service that ignores valid_until (item 28). Comment: UI routing only.
  `GET /v2/users`: `user.list` (isAdminOfAnyGroup) then v1 `userService.findAll`; every group
  admin can list every user with email; no filter applied.
- files.js: add files = `dataset.edit` (platformAdminOnly); listing/tree/search = `list_files`;
  bundle and file download_info = `download`.
- workflows.js: `workflowService.policyActionFor(workflow_type)` maps a workflow name to a
  policy action at REQUEST time; a missing mapping is a 400. Listing runs = `view_workflows`.
  Stop/resume authorize in the handler via `authorizeAction` (the run's name is fetched first),
  and answer 403. `preFetched: {user, context: {req}}`, no resource.

## 14. Routes: access_requests.js (418) and grants.js (569)
Shared patterns in both:
- `resourceIdFn` means different things per route: the grant id (default `/:id`), the
  underlying resource id (`revoke-all`, `resource/...`, `coverage`), or null (create,
  list_for_subject). `preFetchedResourceFn` fills the policy's resource attributes from URL params
  or the body. So policy facts such as `resource_type`, `subject_type`, and `resource_id` are
  CLIENT-SUPPLIED and unverified on those routes.
- Lists are authorized by `Policy.always` (`grant.list`) or by nothing at all, and scoped by a
  service query keyed on `req.user.subject_id`. Handlers apply `req.permission.filter` per row
  with the '*' rule.
access_requests.js:
- `/requested-by-me`, `/my-pending-reviews`, `/reviewed-by-me` have NO authorize middleware and a
  `TODO: attribute filter`. Who counts as a reviewer is defined only in the service query.
- `POST /`: `authorize('access_request','create', {preFetchedResourceFn: {resource_id}})` gives
  the restriction check; the handler reads `resource.type`, then
  `authorizeAction(POLICY_RESOURCE_TYPE[type], 'view_metadata')` -> 403. Then
  `assertGrantItemsApplicableToResourceType` and `assertItemsRequestable`. `submit: true` creates
  and submits in one transaction.
- `GET /:id` read with capabilities (the Review control reads `review`). `PUT /:id`, `/submit`,
  `/withdraw` = update; `/review` = review. None pass preFetched, so the restriction target is
  null (T11). PUT swaps arguments (T20).
grants.js:
- `/access-types`, `/presets`: no authorize (catalogue for any signed-in user).
- `POST /` and `/compute-effective-grants`: `grant.create` with body `resource_id` and
  `resource_type`. `compute-effective-grants` is a dry run plus `getEffectiveCoverage` and
  `impliedIdsByAccessTypeId` to attach indirect coverage.
- `/expiring-soon`: `grant.list` (always), then the handler branches on `isPlatformAdmin(req)`
  from services/auth: a SECOND platform-admin check outside the engine (decision 11 says one).
- `/mine`: `grant.list`, scoped by the service.
- `GET /:id` read and `POST /:id/revoke` hydrate the grant by id (no preFetched; revoke's restriction
  target is null, T11). `revoke-all` = `grant.revoke` keyed by resource id with URL-supplied
  resource_type.
- `/subject/:type/:id` list_for_subject; `/resource/:type/:id` and `/count` and the
  subject-resource pair = list_for_resource; `/coverage` = view_coverage with all four params.

Answered by lookup:
- Resource cache IS keyed by id alone (`PrismaHydrator.js:124`, `${id}` or 'global') in one
  Map shared by every resource type. Two authorizations of different types under the same id,
  or both with a null id ('global'), in ONE request share one record. No route found doing that
  yet (latent). A collection's id equals its resource id, so collection and grant-by-resource-id
  are the likely pair. Watch for it in collections.js.
- Mismatched URL `resource_type` in grant routes: `getDatasetById` returns null ->
  `dataset.owner_group_id` TypeError -> 500; `getCollectionById` uses findUniqueOrThrow -> Prisma
  not-found (404 via prismaNotFoundHandler). Never a false allow, because dataset and collection
  resource ids do not overlap. A 500 on client input, not an escalation.

39. Policy facts on grant and access_request routes come from the URL or the body, not from
    the database. The model harness needs "client-supplied fact disagrees with the row" worlds,
    and a list compiler that reads facts from rows removes the class. (grants.js)
40. Lists of grants and access requests are scoped by service queries with no policy behind
    them (`Policy.always` or no middleware). These are exactly the list queries a compiled
    policy would replace, and today they are the unchecked copies. (grants.js,
    access_requests.js)
41. The resource cache is not keyed by type. Any design that authorizes several types in one
    request (a composed page, a list over mixed resources) must key by (type, id). (core)

## 15. Routes: collections.js (492) and datasets_v2/index.js (713)
Shared patterns:
- Lists: `authorize(type,'list')` (always) then `isPlatformAdmin(req)` (services/auth) branches
  to `searchAll*` vs `search*ForUser({scope, user_id})`; per-row `req.permission.filter` with
  the `list` rule (PUBLIC). So the list scope is the services' SQL, and the platform-admin
  check is repeated in each list handler (collections /search, datasets GET /, grants
  /expiring-soon, collection datasets list).
- Detail: `view_metadata` with `shouldDeriveCapabilities` + `shouldDeriveCallerRole`; response
  `_meta.{caller_role, capabilities}`.
- Creates authorize with `resourceIdFn: () => null` and `preFetchedResourceFn: {owner_group_id}`
  from the BODY (`collection.create`, `dataset.create`), or in the handler via
  `authorizeAction('dataset','contribute'|'create', {identifiers.resource: null, preFetched
  resource {owner_group_id, owner_group_allows_contributions}})` after
  `getOwnerGroupForAuthorization` (name-available, imports, uploads, bulk).
  `restrictionTargetFor('dataset'|'collection', null)` -> null, so the ENGINE never checks
  ARCHIVED on the owning group for any create or contribute. CANDIDATE DEFECT unless services
  check (verify). restrictions.js comment claims dataset.contribute blocks on archived groups.
collections.js specifics:
- `GET /:id/datasets`: `collection.list_datasets`; then `datasetService.viewableDatasetIds`
  (a SQL copy of dataset view_metadata) for `_meta.can_view_metadata`, and `canRequestStage` =
  `authorizeAction('dataset','request_stage')` serially per row (N context hydrations, N grant
  queries). Rows projected by route-level `_.pick(base_attributes.dataset)`, not by a rule.
  So one page mixes three authorization mechanisms: policy, SQL copy, per-row engine calls.
- `POST /:id/stage`: authorized by `collection.view_metadata`; per-dataset `canRequestStage`.
- `PATCH /:id/profile`: edit_metadata, passes whole `req.body` to profileService (check picks).
- `transfer-ownership` route commented out though the action exists.
datasets_v2/index.js specifics:
- `/eligible-owner-groups`: no authorize; `listEligibleOwnerGroups(req.user)` returns groups with
  `admitted_by` -> a service copy of the create/contribute rule.
- `GET /:id`: 404 check after authorize (a missing id reaches the hydrator first).
- `/:id/source-datasets`, `/:id/derived-datasets`: the attribute rule chosen by the caller's
  standing on the PARENT dataset is applied to every related row. An admin of D's owner group
  gets ['*'] on source dataset S owned by another group. CANDIDATE LEAK if the service returns
  full rows without per-row access (verify getSourceDatasets; memory says derived access is
  independent).
- `PATCH /:id` passes req.body (T12). `/:id/archive` = softDelete.

Verified by reading services (2026-09-15):
- ARCHIVED on creates. name-available, imports, uploads go through
  `getOwnerGroupForAuthorization`, which filters `is_archived: false` -> archived group = 404
  "Group not found". So those three refuse, via the denormalised column, not the restriction
  view. `POST /v2/datasets`, `POST /v2/datasets/bulk`, and `POST /collections` do NOT call it,
  and grep finds no is_archived check in services/datasets_v2 or in createCollection. So an
  owning-group admin can likely create a dataset or a collection inside an archived group.
  CANDIDATE, needs a run (restrictions.test.js may cover it; read it, then probe).
- Source/derived lists. `getSourceDatasets` / `getDerivedDatasets` return full `dataset` rows
  by lineage only, with no caller scoping. The route applies the PARENT's
  `view_source_datasets` rule to each row, so an admin of the parent's owning group gets ['*']
  (origin/archive/staged paths, metadata) on related datasets owned by other groups. CONFIRMED
  by reading; verify the rule text in dataset.js and derivedIndependence.test.js, then file.
- `listEligibleOwnerGroups` checks `user.roles.includes('admin')` itself: platform-admin check
  number four outside the engine. Reads active_group_user and effective_user_groups (agrees with
  the engine).
- `viewableDatasetIds` = `createAccessibleDatasetIdsCte(user, ALL, satisfiedBy([LISTING]))`:
  the list CTE reused as a per-row view check.

Probe run 2026-09-15 (scratchpad/probe_create_restriction.js, real module):
  collection.create, dataset.create, dataset.contribute: ARCHIVED blocks them = true, but
  `restrictionTargetFor(type, null, {owner_group_id})` = null. group.create_child target =
  {group_id}. So the engine check is a no-op for every create/contribute. CONFIRMED.
- `effective_restriction` (migration 20260908040000) follows `group_closure` to every
  descendant group and to their datasets and collections. `archiveGroup` sets `is_archived`
  on the one group only. So `getOwnerGroupForAuthorization`'s is_archived filter misses a CHILD
  of an archived group: imports and uploads into a child of an archived group pass both checks.
  The denormalised column and the view disagree on descendants.

TO FILE in .todo (after tests are read, in case a test already covers or contradicts):
- F1 (L1, P1): ARCHIVED never reaches dataset/collection create or contribute. Engine target is
  null for all; POST /v2/datasets, /v2/datasets/bulk, POST /collections have no service check;
  imports/uploads/name-available check only the group's own is_archived, missing descendants.
- F2 (L1, P1): source/derived dataset lists apply the parent's attribute rule to related rows;
  an owning-group admin of D sees ['*'] of sources/derived owned by other groups.
- F3 (L2): `resolveEntityName(tx,'grant')` reads fields it did not select; grant audit target
  names are "Unknown on Unknown for ...".
  *Fixed 2026-09-17.*
- F4 (L2): restrictions.test.js hard-codes six container types; `audit.read_records` is
  unclassified and a derived app's container would be too.

42. "Allowed" for creates is assembled from three places: the engine (policy on body-supplied
    owner_group_id, restriction check that sees no target), a service lookup that filters
    is_archived, and nothing at all on two routes. The plan's Agreement property must include
    creates, and the restriction check must accept the owning group as a target. (routes)
43. Attribute rules are chosen for ONE resource, but handlers apply `req.permission.filter` to
    rows of OTHER resources (source/derived datasets). A filter is only valid for the resource
    it was decided on. A boot-time or lint check cannot see this; a harness world with a
    cross-group lineage edge can. (datasets_v2/index.js)
44. The platform-admin check is repeated outside the engine at least four times
    (`isPlatformAdmin(req)` in three list handlers, `roles.includes('admin')` in
    listEligibleOwnerGroups), against decision 11. A list compiler that treats platform admin as
    "no row filter" would absorb every one. (routes, ownership.js)

## 16. Route: groups.js (788) — ALL route files now read
Follows the patterns in §13-15 (list always + isPlatformAdmin branch + per-row filter; detail
with capabilities + caller role; mutations bound one action each). Group-specific points:
- `/search`: `searchAllGroups` vs `searchGroupsForUser({scope: all|direct|oversight|admin})`;
  the `list` rule exposes the SQL-computed `user_role`, `depth`, `path`. That makes `user_role`
  role derivation number FIVE (engine roles(), deriveCallerRole, `/me.uiPersona`,
  `access_summary`, this SQL column).
- `POST /:id/children`: `isPlatformAdmin(req)` again, to require at least one named admin
  unless platform admin (repeat number five of the platform-admin check).
- `/slug/:slug`: `authorizeAction` with `identifiers: {group_id}`,
  `req.policyExecutionContext` (wrong property name), no user -> throws (L3 T12, known).
- `PATCH /:id`: group admin can flip `allow_user_contributions`, which changes
  `dataset.contribute` for every effective member: an operation with an access effect.
- `PUT/DELETE /:id/avatar`: `edit_metadata`; writes prisma directly from the route; no audit
  row, no version check.
- `/:id/members` `view_members`; bulk remove uses Promise.all over `ensureNotRemovingLastAdmin`,
  which reads `group_user` with `removed_at: null` only (T13 known; also ignores valid_until,
  item 28).
- `/:id/ancestors` (`view_ancestors` = member | oversight) applies the rule chosen on THIS group
  to ANCESTOR rows. An admin of G matches `isGroupAdmin` -> ['*'] on every ancestor, where they
  are only an effective member (member rule = PUBLIC + PROFILE + ...). Same cross-resource
  projection as F2. CANDIDATE F5 (verify fields returned by `getGroupAncestors`).
  `/:id/descendants` is consistent: admin of G has oversight of every descendant anyway.
- `reparent` and transfer routes are commented out, so group tree edits after creation do not
  exist (the plan's operation table should mark reparent as unbuilt).

## 17. Service layer: the list rule ALREADY re-states the dataset policy in SQL (fetch.js)
This is the single most important finding for the plan. `searchDatasetsForUser` and
`viewableDatasetIds` build `createAccessibleDatasetIdsCte(user_id, scope, grant_access_types)`,
a UNION of three branches that mirror the three dataset view_metadata terms:
- admin: `dataset JOIN active_group_user gu WHERE gu.user_id = $user AND gu.role = 'ADMIN'`
  (= `isDatasetOwningGroupAdmin`, but parameterised on the user's memberships in SQL, not read
  as a user fact).
- oversight: `dataset JOIN effective_user_oversight_groups WHERE user_id = $user`
  (= `hasDatasetOwningGroupOversight`, joining the same view the user fact SELECTs from).
- grant: `grantService.accessibleDatasetIdsByGrantsQuery(user_id, satisfiedBy([VIEW_METADATA]))`
  (= `userHasGrant('DATASET:VIEW_METADATA')` widened through the order by `satisfiedBy`).
So the plan's "list compiler = partial evaluation of the policy terms" is not new work; it is
ALREADY WRITTEN BY HAND for datasets, as a second copy of the same three terms, with no shared
source. This is the drift the user's original instruction is about: the rule lives in
dataset.js AND in fetch.js, and nothing keeps them equal. `LISTING_ACCESS_TYPE` is the same
constant the policy uses; the ownership/oversight branches are hand-copies.
- Collections and groups have their own `search*ForUser` copies (searchCollectionsForUser,
  searchGroupsForUser); each is a third statement of that resource's terms.
- `getSourceDatasets` / `getDerivedDatasets` (index.js) do NOT reuse the CTE: plain
  findMany by lineage, no access filter. F2 CONFIRMED — the route then applies the parent's
  attribute rule to unfiltered related rows.
- `explainDatasetAccess` is a FOURTH statement of the dataset rule in prose+JS (platform admin,
  admin, oversight, grants), used for a debug endpoint. Same terms, fourth copy.
- Grant/access-request LISTS (fetch.js) read `valid_grants` view directly with a resource or
  subject filter, no per-caller rule — the authorization is the route's list_for_* policy on
  the whole set, not per row.

45. THE central plan finding: the dataset access rule exists in at least four places —
    dataset.js policy (per-resource JS), createAccessibleDatasetIdsCte (list SQL),
    viewableDatasetIds (per-row SQL), explainDatasetAccess (debug JS). Collections and groups
    add their own list SQL. The user's "the rule is far from the data and lists restate it by
    hand" is literally true and measurable. The plan's target — one definition, compiled to
    SQL for lists — would collapse these four. The Agreement property must test policy vs CTE
    row-for-row over the reference worlds. (fetch.js)
46. `satisfiedBy` / `accessibleDatasetIdsByGrantsQuery` are the grant term's SQL form and
    already exist; `getGrantAccessTypesForUser` (context hydrator) is the same term's JS form.
    Two forms, presumably agreeing, untested against each other. The plan should add that
    agreement test and treat it as the template for compiling the one context-fact term.
    (fetch.js, context hydrator)

## Open questions (remaining after all source read)
- Do `getGrantAccessTypesForUser` and `accessibleDatasetIdsByGrantsQuery` agree row-for-row?
  (both exist; no test found; a harness item)
- F5: what does `getGroupAncestors` select (is ['*'] on an ancestor more than the member rule)?
- Is every `policyActionFor` value a registered dataset action, checked anywhere (boot/test)?
- Skill says `JSON.stringify(container.export())` exposes part names; renaming seems to erase
  them. Check platformAdminShortCircuit.test.js.

## 18. Tests read so far (tests/authorization/*, services/helpers.js)
Correction to earlier notes: PolicyContainer DOES expose iteration — `getActionNames()`,
`hasAction(a)`, `getPolicy(a)`, `getAttributeRules(a)`, and `export()` (JSON-serialisable,
INCLUDES combinator part names, so the composed name carries its OR'd parts' names). So the
"no iteration API" note (item 7) is wrong about the container; it is PolicyRegistry that lacks
one, and restrictions.test hard-codes the six type names for exactly that reason.
- platformAdminShortCircuit.test.js: seeds an admin via `user_role`; asserts (a) no container's
  export() contains 'isPlatformAdmin'; (b) `isPlatformAdmin.name` unchanged; (c) every dataset
  action granted for the admin without membership; (d) capabilities all true; (e) callerRole
  PLATFORM_ADMIN; (f) filter passes origin_path; (g) outsider refused; (h) a restriction still
  blocks the admin and result.blockedBy === 'ARCHIVED'. RESOURCE_TYPES here includes 'audit'
  (seven), unlike restrictions.test (six). Uses `authorizeAction`, so that second pipeline is
  the one under test, not the middleware.
- route_policy_bindings.test.js: reads `middleware.authorizes` off the router stack for GROUPS,
  COLLECTIONS, DATASETS_V2 and AUDIT only. Asserts archive != unarchive policy; every authorize
  names a real action (via hasAction); audit tabs bound to view_audit_logs; platform log =
  audit.read_records and its policy evaluates false; no transfer_ownership route or binding but
  the action still exists. NOT covered: grants, access_requests, users, public bindings — so
  the grant revoke/restriction routes have no binding test.
- public_router.test.js: every route GET, every route .view_profile, every route guarded;
  mounted above authenticate; the set above the line is exactly about/auth/env/public/reports.
- dataset.attribute_filters.test.js: is_staged public; paths+du_size+metadata not public;
  view_sensitive_metadata unlocks staged_path (and includes origin_path); oversight sees
  num_files, not staged_path; `list` rule = exactly PUBLIC_ATTRIBUTES, one rule. Confirms §7.
- dataset.contribute.test.js: contribute admits owning-group admin (open or closed) and a
  member only when allow_user_contributions; create is admin-only. Uses authorizeAction with a
  preFetched resource {owner_group_id, owner_group_allows_contributions}. NOTE: it never tests
  contribute against an ARCHIVED owning group, so F1 is uncovered here.
- grantHydrator.test.js: resource_type resolves to DATASET / COLLECTION. Confirms the hydrator,
  not the null-target revoke path (F/T11).
- helpers.js: createTestUser/Group/ChildGroup/Dataset/Collection, getAccessTypeId,
  delete* cleanup. `createTestGrant` referenced by grantHydrator.test (defined lower in helpers).
  Groups made by helper do NOT add the actor as a member (tests add group_user rows directly,
  sometimes bypassing the service and its valid_until/active-view logic).

Open question resolved: `container.export()` DOES expose combinator part names (the
platformAdmin test relies on it). My earlier "renaming erases them" was wrong.

## 18b. Core tests: Policy.test.js, core/authorize.test.js
- Policy.test: full constructor validation; evaluate throws "Missing required `<bucket>`
  attributes"; or/and short-circuit + error propagation; `not` EXISTS and is tested (inverts,
  preserves resourceType) — correction: `not` is untested-in-builtin, not absent from core.
  or/and NAMES contain each child name (export exposes them). Combinator still stores NO child
  accessor — tests read only evaluate/name/requires, so item 4 (structure discarded) stands.
  `clone` shares the same `_evaluate` reference.
- core/authorize.test: uses a StubHydrator, no DB. Confirms: user+context always hydrated,
  resource only when resourceType set; phase-1 and phase-2 share ONE user-cache Map; empty
  rules -> filter returns {} ("deny-all attributes", the skill trap); first attribute rule wins;
  '*' passes everything; `identifiers.user` null throws "User identifier is required".
  IMPORTANT: the EVENT mechanism is fully tested here (`events: {emit, eventToEmit}` ->
  emits `{granted, policy: policy.name, ...}`). So the engine CAN emit; index.js just passes
  `events = undefined`, so nothing emits in production (item 34 confirmed, mechanism is live).

## 19. Service tests vs the candidate defects
restrictions.test.js (314): archives a parent group, then asserts ARCHIVED blocks edit_metadata
on the group, reaches DESCENDANT groups, reaches the datasets of both, leaves reads alone,
exempts unarchive, blocks transfer_ownership and grant.revoke on its resources, does not reach
an unrelated group; lift closes the row; re-archive opens a second; double-archive is
idempotent; an archived collection carries a restriction on its own resource id; and
`is_archived` agrees with the open ARCHIVED rows for every group and collection.
- CRITICAL: every assertion calls `blockingRestriction(type, action, {EXPLICIT target})`.
  Nothing calls `checkRestriction` (the injected checker) or goes through a route, so the
  null-target path is never exercised. That is precisely why F1 (and T11) survive: the
  classification and the view are right, and the wiring that chooses a target is untested.
- The is_archived agreement test compares SETS OF ROWS, not effective reach, so the
  denormalised-column-vs-view disagreement on descendants (imports into a child of an archived
  group) is not covered either.
derivedIndependence.test.js (184): pins decision 10 — a derivative may be granted to Public
while the source stays scoped, chains do not accumulate a ceiling, and "lineage is recorded but
is not an authorization edge" (a stranger with a grant on the source does NOT reach the
derivative, asserted via userHasGrant).
- So F2 does not merely leak: it CONTRADICTS the decision this file pins. The grant layer
  refuses to let lineage confer access, and `GET /:id/source-datasets` then hands the parent's
  ['*'] filter to rows of the source. The tests cover the grant half and not the route half.
grantHolderAttributes.test.js (88): runs the real decision for four access types and asserts
num_files/origin_path/staged_path per type. Its header states the first-match hazard explicitly
("a rule for a wider type only takes effect when it sits above VIEW_METADATA"). It tests grant
holders only — the overseer-who-also-holds-a-sensitive-grant case (item 15) is untested.

More service tests (2026-09-15):
- listVisibility.test.js: THE agreement test that already exists. Eight grant shapes; for each
  it asserts the dataset list, the collection list, and the collection page's per-row flag all
  agree with the `view_metadata` decision the page makes. Covers the cross-type cases
  (COLLECTION:LIST_CONTENTS opens the collection not its datasets; DATASET:VIEW_METADATA issued
  ON a collection does the reverse) and a grant to AUTHENTICATED_USERS. Also asserts
  `accessibleDatasetIdsByGrantsQuery` THROWS when given no access types (fail-closed).
  So the §17 drift is already partly guarded — for grant-shaped cases on one resource each.
  What it does not sweep: admin/oversight rows, archived resources, deleted rows, pagination
  boundaries, or the count query. That is the gap the plan's worlds should fill.
- anonymousSubjectSet.test.js: containment runs one way — Public reaches everyone, Authenticated
  Users never reaches the anonymous principal; the anonymous principal expands no memberships
  (PUBLIC_GROUP_ID has no rows in effective_user_groups). Written against
  `getGrantAccessTypesForUser` "because that is what the context hydrator calls on the request
  path" — the JS form of the grant term is the tested one.
- coverage.test.js: getEffectiveCoverage reports DIRECT / GROUP (via_group_id) / PRINCIPAL /
  via_collection_id, and a revoked grant reaches nobody; a collection is covered only by grants
  on itself (containment one-way, matching listVisibility).
- owningGroupGrant.test.js: decision 12 — creating a resource SEEDS a grant to the owning group
  (collection -> COLLECTION:LIST_CONTENTS, dataset -> DATASET:LIST_FILES, SYSTEM_BOOTSTRAP, no
  expiry, issuing_authority = the group). Membership confers nothing structurally; revoking the
  seeded row removes member access. The seeding helper REFUSES an unknown resource type
  ("No owning-group access type is defined") — the "refuse rather than default" pattern the
  project's CLAUDE.md asks for, and a precedent for the plan's coverage checks.
- viewProfile.test.js: visibility PRIVATE/AUTHENTICATED/PUBLIC x anonymous/stranger/member;
  publishing a profile grants nothing else (view_metadata, view_members, view_audit_logs all
  still refused); public profile projection hides _count, email, ancestors; a public collection
  profile still refuses list_datasets. Header notes the anonymous cases pass identifiers only
  so the `is_anonymous` virtual actually runs — "a virtual attribute is dead code on the route
  path, because the middleware pre-fetches req.user".

48. A test already asserts list-vs-page agreement for grant shapes (listVisibility). The plan
    should generalise that file rather than invent a harness: same property, all four
    structural paths, all resource types, over generated worlds.
49. Two patterns in the tests are the ones the plan should keep: a helper that REFUSES an
    unknown type instead of defaulting (seedOwningGroupGrant), and tests written against the
    exact function the request path calls (anonymousSubjectSet -> getGrantAccessTypesForUser).

CORRECTION: a `tests/routes/` directory exists (access_requests.create 197, auth.invite 283,
groups.invitations 301, auth/singup 308, health) plus `seed_baseline.test.js` (208). Total suite
is 17,882 lines, not 16,916.
- routes/access_requests.create.test.js is the ROUTE-LEVEL pattern and the template the plan's
  harness should copy: build a bare `express()` app, `app.use` a middleware that sets
  `req.user = currentUser`, mount the REAL router and the real error handler, drive it with
  supertest. It asserts the outsider gets 403 AND that no row was written, that an admin gets
  201, `submit:true` -> UNDER_REVIEW, a missing resource is 404 not 500, a COLLECTION type on a
  dataset is 400, and that reading one back returns `_meta.capabilities` containing 'read'.
  NOTE: it does not mount `initializePolicyContext`, so `req.policyContext` is undefined and
  each authorize call builds its own caches — the harness must decide whether to mount it.
- listVisibility asserts a FOUR-WAY agreement: page decision == dataset list == collection-tab
  per-row flag (viewableDatasetIds), and collection page == collection list. That is exactly
  the Agreement property, already written for grant shapes.
- groups.invariants.test.js: system principals immutable (no members, no closure rows, cannot be
  deleted, excluded from searchAllGroups); an archived group makes addGroupMembers and
  removeGroupMembers throw 409 AT THE SERVICE; and — directly pinning item 28's engine side —
  `group_memberships` drops the row the moment a member is removed, while the raw group_user row
  survives with removed_at set ("history was preserved, authority was not").
- collections.invariants.test.js: cross-group datasets refused (400), a dataset whose OWNER GROUP
  is archived is refused by addDatasets (400), an archived collection refuses addDatasets,
  removeDatasets, updateCollectionMetadata (409), version/slug invariants.
- So the archived checks ARE tested for every mutation of an existing resource, at the service.
  F1 narrows precisely: it is CREATE (dataset create, dataset bulk create, collection create)
  into an archived owning group that no layer checks and no test covers.

- middlewares.test.js (343): MOCKS `authorizeWithFilters` wholesale and builds the factory as
  `createAuthorizationMiddlewareFunction(registry, stubHydrationRegistry, {})` — i.e. with NO
  restrictionChecker and NO platformAdmin argument. So the two injected outer layers (restriction
  check, platform-admin short-circuit), the capability derivation, and the caller-role derivation
  are NEVER exercised at the middleware level. What it does cover: boot-time failure when the
  type or action is unknown; 403 on deny; `req.permission` set on grant; default and custom
  requesterFn/resourceIdFn; preFetched.user / {req} / resource passthrough; policyContext
  passthrough and a fresh cache when it is null; rejection propagation; `req.user` undefined
  passes `identifiers.user: undefined` (no throw here, because the engine is mocked).
  THIS is why F1 and T11 survive: the restriction wiring has no test at any level.
- accessTypeClosure.test.js (267) is the best existing model of what the plan wants:
  the graph is acyclic; every seeded type appears in both closures; every seeded edge names two
  real types; and "the seeded rows match the constant" — `grant_access_type_implication` rows
  compared to `GRANT_ACCESS_TYPE_IMPLICATIONS` string-for-string. Plus both directions
  (`satisfiedBy` widens a requirement, `expand` widens a holding), one-way travel (download does
  not confer compute), preset reduction to a maximal set, closure cached by identity, and
  evaluation honouring the order end to end. A constant, a table, and a test that they agree:
  exactly the Agreement property, for the one relation that already has it.
- dataset.eligible-owner-groups.test.js (166) already contains a policy-vs-service agreement
  test: "agrees with the contribute policy on every group it offers" iterates the offered groups
  and asserts `authorizeAction('dataset','contribute')` grants each, and that the withheld group
  is genuinely refused. Also: an archived group is never offered however open it is; a system
  principal is never offered; `getOwnerGroupForAuthorization` returns null for system principals
  ("what stops a platform admin from importing a dataset into Public").
- groups.no-active-admins.test.js: excludes system principals and archived groups; counts a
  group whose only admin is a deleted user as having none.

F1 FINAL SHAPE: the archived-owning-group check is present and tested on every path that goes
through `getOwnerGroupForAuthorization` (name-available, imports, uploads) and on every mutation
of an existing resource (service-level 409/400). It is absent on exactly three routes —
`POST /v2/datasets`, `POST /v2/datasets/bulk`, `POST /collections` — because they authorize with
a null resource id (no restriction target) and never resolve the owning group through that
helper. Also absent for a child of an archived group, where the view says restricted and the
`is_archived` column says otherwise.

- dataset.workflow-gating.test.js ANSWERS an open question: the workflow->action map IS checked.
  "every configured action exists on the dataset policy container" iterates
  `runnableWorkflows()` and asserts `datasetPolicies.hasAction(action)`; an unregistered
  workflow returns null and the route 400s ("refused rather than defaulted"); `constructor` and
  `toString` return null (no prototype inheritance); config and registry must agree both ways.
  So item 37 is covered by a test, though not at boot. It is also the best existing example of
  the plan's "every configured name is a registered action" check.
  Also pins `bulkStage` bucketing: every dataset lands in exactly one of staged/denied/skipped,
  a denied one never reaches the workflow service, MAX_BULK_STAGE = 100.
- grants.invariants.test.js (419) pins the TIME dimension in the database, not in JS:
  `valid_period` is [valid_from, valid_until) (lower inclusive, upper exclusive, infinite when
  null); the `valid_grants` view excludes revoked, not-yet-valid, and expired rows; transitive
  membership resolves through the closure; both system principals reach an unaffiliated user;
  `grant_no_overlap` rejects an overlapping window for the same (subject, resource, type) with
  409. Plus: no preset applies to a DATASET, a COLLECTION type on a dataset is refused, and
  `assertItemsRequestable` refuses DATASET:VIEW_SENSITIVE_METADATA (and any preset containing
  it) with a paired positive case so the refusal is not vacuous.
- access-request.invariants.test.js (511) pins the STATE MACHINE: subject validation (self
  allowed, group allowed when requester is its admin, another user refused 403);
  `_assertNoInFlightRequests` keyed on SUBJECT not requester; review must decide every item
  exactly (missing or foreign item -> 409, request stays UNDER_REVIEW); items immutable once
  submitted; `closed_at` set on APPROVED, REJECTED, WITHDRAWN (from either state), EXPIRED;
  `submitted_at` null in DRAFT; unique (request, access_type); an approved grant carries
  creation_type ACCESS_REQUEST and the item records created_grant_id; a group request issues the
  grant to the GROUP and not to the requester.
  T20 CONFIRMED FROM BOTH SIDES: this test calls
  `updateAccessRequest(ar.id, requester.subject_id, {items})` — (request_id, actor_id, data) —
  while routes/access_requests.js:315 calls `updateAccessRequest(req.params.id, data,
  req.user.subject_id)`. The service test uses the correct order, so the route is wrong.
- access-request.access-summary.test.js (382): `access_summary` = {issued, live, revoked,
  expired, last_revoked_at, last_revocation_type} with the invariant issued = live + revoked +
  expired asserted over a listing; `covered_elsewhere` widens through the access-type order and
  finds a GROUP grant of a wider type behind a preset item (access_type_id null); an approval
  writes NO grant when a wider live grant already confers it, and the item is still APPROVED;
  a retired preset makes approval refuse (400) rather than approve and write nothing.
- dataset.owner-group.test.js (230): owner_group_id is NOT NULL with a DB default naming
  `Unassigned Datasets`; the v2 builder refuses without an explicit group; an explicit NULL is
  rejected; names are unique per group, not globally; a group owning datasets cannot be deleted.
  The quarantine group is ARCHIVED, has no members, is listable, cannot be deleted, and has an
  archive_key. Note for F1: because that group is archived, every legacy-created dataset lands
  under an ARCHIVED restriction by default — which is deliberate, and is also the one place the
  create path's missing restriction check is load-bearing in the other direction.

- PrismaHydrator.test.js (436): mocks `schemaMap` so DMMF is never touched. Pins the
  classification (column / relation / virtual / unknown), the boot-time refusals (unknown model,
  duplicate virtual, virtual shadowing a field, non-function loader), and the request-time
  HydrationError set (attributes not an array, non-string attribute, cache not a Map, unknown
  attribute, null id with DB attributes required). Behaviour pinned: idAttribute always in the
  select and a custom one REPLACES `id`; `where` uses the custom idAttribute; preFetched is used
  instead of the DB and never overwrites cache; a falsy '' preFetched value still counts as
  present; virtual loaders run AFTER the DB fetch and can read the fetched columns from the same
  call; a cached virtual is not recomputed; id 0 is a valid id.
  IMPORTANT for item 41: the cache key is pinned BY TEST — "numeric id 1 and string id '1' map
  to the same cache key, producing a cache hit". So `${id}` is deliberate, and keying by
  (type, id) would be a deliberate change to an asserted behaviour, not a bug fix.
- profileColumns.test.js: `profile_visibility` defaults to PRIVATE (so a migration publishes
  nothing), the enum accepts AUTHENTICATED/PUBLIC/PRIVATE, and the tagline rules (non-blank,
  <= 120 chars) are DB CHECK constraints because Prisma cannot express them. States plainly:
  "the only column here that any policy reads is profile_visibility".
- profileUpdate.test.js: the write path refuses an unknown visibility, bad link types, non-http
  and non-URL links, more than ten links, a publication with no/!DOI or a far-future year, and
  an empty body — all 400; a stale version is 409; it trims, replaces lists outright, leaves
  metadata keys it does not own alone, clears with null, and writes an audit row naming
  `changed_fields`.
- resourceAuditRecords.test.js — CORRECTION to my §11 note: `TARGET_TYPE` having no DATASET is
  DELIBERATE and asserted (`expect(Object.values(TARGET_TYPE)).not.toContain('DATASET')`, plus
  zero rows with target_type DATASET in the table). A dataset is found only through
  `resource_id`, which is why the query matches either column; count is the total, not the page.
  (The `SUBJECT_TYPE = {USER, DATASET}` oddity is still unexplained.)
- system_accounts.test.js: `svc_tasks` is pinned at a fixed user id and subject id, holds
  role_id 1 (admin), and has a subject row because `grant.granted_by` points at
  user.subject_id. `ensureSvcTasksAccount` is idempotent, adopts an existing account rather than
  renumbering, creates at a generated id when the pinned ones are taken, and REFUSES when
  another user holds the service email. This is the plan's `system_principal` in practice: an
  account with the platform-admin role that the workers authenticate as.

## 20. Lifecycle suites (the state transitions the user's question is about)
- grants.lifecycle.test.js (521): create for a USER and for a GROUP; valid_from defaults to now,
  valid_until null means forever; GRANT_CREATED and GRANT_REVOKED audit rows carry subject,
  subject_type, resource, resource_type, resource_name and the access type name; revokeAllGrants
  names the resource on every row AND notifies the subject ("Your access to `<dataset>` was
  revoked", body = the reason); userHasGrant true directly, true through a group, false for an
  outsider, false after revocation; a future valid_until is active and a past one is not;
  listGrantsForSubject paginates; listGrantsForResource active=true excludes revoked and
  active=false lists exactly them.
- groups.lifecycle.test.js (533): closure self-row at depth 0, parent->child depth 1,
  grandparent->grandchild depth 2; ancestors/descendants; metadata DEEP-MERGES; version OCC with
  409 on stale; rename regenerates the slug; archived group refuses metadata updates;
  archive/unarchive flip is_archived and archived_at with audit rows; membership add is
  idempotent, remove CLOSES the row (removed_at, removed_by) rather than deleting, re-adding
  opens a second row with exactly one open at a time; PINS item 28's other half — "an expired
  membership confers nothing even though the row is open", asserted directly against
  `effective_user_groups`; promote/demote; promoting a non-member is 409; and
  searchGroupsForUser scopes (all / direct / oversight / admin) tested against a real hierarchy.
- access-request.lifecycle.test.js (756): the whole machine — DRAFT -> UNDER_REVIEW -> APPROVED /
  PARTIALLY_APPROVED / REJECTED, DRAFT -> WITHDRAWN, UNDER_REVIEW -> WITHDRAWN, UNDER_REVIEW ->
  EXPIRED via expireStaleRequests; an audit row per transition; update only in DRAFT; re-submit
  409; withdraw twice 409; PARTIALLY_APPROVED when the decisions are mixed; a group request
  issues the grant to the GROUP and its members inherit; the three query functions filter by
  status, resource_id and resource_type.

50. Between groups.lifecycle ("an expired membership confers nothing", against
    effective_user_groups) and groups.invariants ("group_memberships drops the row as soon as
    the member is removed", against the hydrator), BOTH halves of the engine's membership
    semantics are already pinned by tests. The services that read `group_user` with
    `removed_at: null` alone (groupService.isGroupAdmin, access_requests, the route's
    ensureNotRemovingLastAdmin) therefore contradict a tested invariant, which strengthens
    item 28 from "a disagreement" to "a disagreement with the tested side identified".

- collections.lifecycle.test.js (340): create (owner_group_id, is_archived false, version 1,
  slug, COLLECTION_CREATED audit); update (description, slug regenerated on rename, 409 on an
  archived collection); archive/unarchive; delete removes the row (a case since removed with
  collection delete); addDatasets rejects
  cross-group (400) and soft-deleted (400) datasets and is idempotent; removeDatasets;
  findCollectionsByDataset and findCollectionsByOwnerGroup scope correctly;
  listDatasetsInCollection paginates with a correct total.
- groups.hierarchy.test.js (115): getGroupHierarchy nests children under roots, paginates ROOTS
  (root_limit/root_offset), filters by archived status, returns [] on no match.

51. Collection membership of a dataset is constrained to ONE owning group (addDatasets refuses
    cross-group), so "a collection groups datasets different groups own" — the stated reason the
    collection datasets route checks each row separately and bulkStage returns partial results —
    is NOT reachable through the service today. Either the constraint or the rationale is
    stale; the plan should say which. (collections.invariants + collections.lifecycle vs
    routes/collections.js)

47. The tests are strong on the LAYERS and weak on the WIRING. Policies, closure, restriction
    classification, and the restriction view each have direct tests; what has no test is the
    composition — which target the restriction checker gets, which resource a filter is applied
    to, which action a route binds outside the three routers covered. Every one of F1-F5 lives
    in that gap. The plan's harness should drive ROUTES (or at least the middleware), not
    services, for the agreement property.

## STATUS: engine source + callers read; 8 of ~10 authorization tests read (core/middlewares and
## PrismaHydrator tests still pending, lower priority); service tests in progress.
Next: core/authorize, core/PrismaHydrator, core/middlewares, core/Policy tests; then
tests/services (helpers done) — grants, groups, collections, access-requests, restrictions,
datasets, profiles, invitations — reading for coverage of F1-F5 and the drift in §17.

## §21 Two functions named userHasGrant, and an empty access-type list

There are TWO different `userHasGrant` in the codebase, and they are not related:

1. **The policy term** — `src/authorization/builtin/policies/dataset.js:87` and
   `collection.js:28`. A factory returning a Policy. Pure: `requires.context =
   ['active_grant_access_types']`, `evaluate: (u, r, ctx) => ctx.active_grant_access_types
   .has(access_type)`. It validates its argument against `VALID_GRANT_NAMES` at construction,
   so a typo fails at boot. The dataset one names itself `userHasGrant(${access_type})`; the
   collection one names itself plain `userHasGrant` — so a collection policy's `export()`
   cannot say WHICH grant the term wanted. (Small asymmetry, worth fixing.)
2. **The service function** — `src/services/grants/helpers.js:274`. Runs SQL. Takes
   `{user_id, resource_type, resource_id, access_types}` where `access_types` is an ARRAY of
   names, widens the requirement via `accessTypeClosure.satisfiedBy`, and returns
   `results.length > 0`.

**The empty-list hazard.** `userDatasetsQuery`/`userCollectionsQuery` treat an empty
`access_types` as "no filter":

```js
const access_type_filter = access_types && access_types.length > 0
  ? Prisma.sql`gat.name IN (${Prisma.join(access_types)})` : Prisma.empty;
const whereClause = access_type_filter !== Prisma.empty ? Prisma.sql`WHERE ${...}` : Prisma.empty;
```

For `getGrantAccessTypesForUser` (helpers.js:255) that is correct and deliberate — it wants
every type the user holds. For `userHasGrant` it is a **fail-open**: an empty or missing
`access_types` makes the question "does this user hold ANY grant on this resource, or on any
collection containing it", and returns true.

Two same-shaped option objects, opposite meanings for the same empty value. That is the
defect, not the SQL.

**Is it live?** No production caller can reach it today:
- `datasets_v2/index.js:161` and `collections.js:423` are thin wrappers taking `access_type`
  (singular) and passing `access_types: [access_type]`. A repo-wide grep finds NO caller of
  either wrapper, in src, tests, or ui. Both are dead code.
- Every live caller is a test, and all but two pass a correct `access_types` array.

**The two that do not** are `access-request.lifecycle.test.js:281` and `:748`, which pass
`access_type_id: viewMetadataTypeId`. `access_types` is then `undefined`, the query drops its
WHERE clause, and `expect(hasGrant).toBe(true)` / `expect(hasAccess).toBe(true)` pass if the
subject holds a grant of ANY type. Both tests assert that approving a request produced a
VIEW_METADATA grant; neither can currently fail if the wrong type were issued.
(Also note both omit `resource_type`, so they take the DATASET branch by default — which
happens to be the branch they want, by accident rather than by argument.)

### Implications for the plan doc

52. An access check whose argument is missing must REFUSE, not widen. `userHasGrant` with no
    `access_types` should throw the way `accessibleDatasetIdsByGrantsQuery` already throws
    ("needs the access types that count"). The asymmetry between those two neighbours in the
    same file is the clearest evidence that the guard was understood in one place and
    forgotten in the other. This is the CLAUDE.md "refuse rather than fall back to a default"
    rule applied to authorization, and it is the kind of thing the plan's boot-time checks
    cannot catch because the argument arrives at runtime.

53. Two functions sharing a name across the policy layer and the service layer, with
    different signatures and different notions of the same parameter, is exactly the
    "splintered code" the user described. The policy term asks a hydrated Set; the service
    asks the database. The plan should say which one is the definition and make the other
    derive from it — this is the same one-rule-many-statements problem as item 45 (the
    dataset rule in four places), at the granularity of a single term.

54. Test-only code paths still need the guard. The two lifecycle assertions are vacuous
    today, and nothing would have told anyone: a test that cannot fail the way it intends
    reads as coverage. The plan's oracle work should include a check that each authorization
    helper rejects an under-specified question.

### satisfiedBy, precisely (accessTypeClosure.js:113)

```js
async function satisfiedBy(access_types) {
  if (!access_types || access_types.length === 0) return [];
  const { satisfiedByClosure } = await getAccessTypeClosure();
  const widened = new Set();
  access_types.forEach((name) => {
    const closure = satisfiedByClosure.get(name);
    if (closure) closure.forEach((n) => widened.add(n));
    else widened.add(name);   // an unseeded type still matches itself
  });
  return [...widened];
}
```

So there are two bad-input cases and they behave OPPOSITELY:
- an **unknown name** is kept as itself, matches no row, and the check returns false — safe;
- an **empty or missing list** returns `[]`, which the query builders read as "no filter" —
  fail-open.

The safe case was thought about (the comment says so). The unsafe one was not. Four sibling
functions in the same file — `satisfiedBy`, `satisfiedByIds`, `expand`, `reduceToMaximalIds` —
and only `expand` lacks the empty guard, correctly, because expanding nothing is nothing.

## §22 access-request.presets.test.js (877 lines)

The largest single suite, and the best existing example of what the plan is asking for: it
enumerates the cases of one transition rather than sampling them.

Setup chooses **three pairwise incomparable access types** on purpose
(VIEW_SENSITIVE_METADATA, DOWNLOAD, LIST_DERIVED_DATASETS) with a comment explaining that the
first three by id would collapse under the implication order and leave the expansion and
deduplication cases with nothing to act on. That is a test author reasoning about the
algebra before choosing fixtures.

Covered: create with preset items (preset_id set, access_type_id null, preset hydrated);
mixed preset and direct items; submit validation against an existing grant and against an
in-flight request; review expansion to individual grants; deduplication across an overlapping
preset and direct item; two overlapping presets in one request; and then the four-way
supersede/skip matrix —

| existing grant | approved expiry | outcome |
|---|---|---|
| finite, shorter | finite, longer | SUPERSEDED + new grant |
| finite, longer | finite, shorter | skipped, GRANT_CREATION_SKIPPED audit naming existing_grant_id |
| indefinite (valid_until null) | finite | skipped |
| finite | Expiry.never() | SUPERSEDED + new grant with valid_until null |

plus one test that exercises supersede and skip in the SAME preset expansion, and partial
approval producing PARTIALLY_APPROVED.

### Implications for the plan doc

55. The supersede/skip matrix is the model the plan wants, already built, for one transition.
    It enumerates the cross-product of (existing expiry ∈ {none, shorter, longer, indefinite})
    × (approved expiry ∈ {finite, never}) and asserts both the row outcome AND the audit
    event. The plan should name this suite as the template for the transition tables it asks
    for elsewhere, rather than inventing a new form.

56. Its weakness is the other axis. Every case fixes ONE subject (a user), ONE resource (a
    dataset), and one reviewer who is a group ADMIN. Nothing here varies the subject kind
    (group vs user), the resource kind (collection), or the reviewer's standing. The
    enumeration is complete in the expiry dimension and a single sample in every other one —
    which is exactly the user's original complaint, visible inside the best suite in the repo.

57. `expect(grants.length).toBeLessThanOrEqual(3)` in the deduplication test is an inequality
    where the exact count is knowable. A bound passes for a range of wrong answers. The plan's
    test guidance should say that a computable quantity gets an equality.

## §23 The concurrency suites

Five suites (access-request 562, issueGrants 468, grants 343, collections 264, groups 260)
all built on `tests/services/concurrency-utils.js` — `runRace(setup, race, assert, reset)`
plus `fanOut(n, fn)` and a shared `RACE_TIMEOUT_MS` that every suite installs with
`jest.setTimeout`.

**groups.concurrency.test.js (260)** — races and what each pins:

| race | assertion |
|---|---|
| 5× `updateGroupMetadata` with the same `expected_version: 1` | exactly 1 fulfilled, 4 rejected with `status === 409` |
| same, checking the row | final `version === 2`, not higher |
| sequential updates with correct versions | v1→2→3 both succeed |
| 5× `addGroupMembers` same user | 0 rejected (ON CONFLICT DO NOTHING) and exactly 1 `group_user` row |
| 5× `removeGroupMembers` same user | 0 rejected, membership absent afterwards |
| 2× `createGroup` under one parent | both fulfilled, `getGroupDescendants` ≥ 2 |
| `archiveGroup` vs `addGroupMembers` | archive must succeed; group ends archived; member may or may not be there |
| `promoteGroupMemberToAdmin` vs `demoteAdminToMember` | final role ∈ {ADMIN, MEMBER} |

### Implications for the plan doc

58. **Optimistic concurrency is real and enforced on groups, via `expected_version`.** The
    group row carries `version`, the service refuses a stale write with 409, and the race
    test proves only one write lands. Nothing equivalent exists for datasets, collections,
    or grants in these suites — grants rely instead on a DB exclusion constraint
    (`grant_no_overlap`) and let one INSERT win by error. Two different concurrency
    strategies for two resource kinds. The plan's state-transition model has to say which
    transitions are version-guarded and which are constraint-guarded, because the observable
    failure differs: a 409 the UI can retry, versus a raw DB error.

59. **The last two group races assert only non-corruption, not an outcome.** "the group ends
    archived, and the member may or may not be present" and "the final role is one of the two
    legal values" are the honest thing to write when the service does not order the two
    operations — but they are also precisely the transitions a state model would have to
    make deterministic. `archiveGroup` vs `addGroupMembers` is the F1 question (item 1) seen
    from the other side: adding a member to an archived group is a mutation the restriction
    layer should refuse, and here it is explicitly allowed to succeed. The test documents the
    gap rather than closing it, and the comment says so plainly ("Either outcome is valid").
    That makes it the best single citation for why the restriction layer needs the
    systematic treatment the plan proposes.

60. `archiveGroup` "has no precondition guard" — stated in the test's own comment. So
    archiving is not itself a guarded transition; it always succeeds. Combined with item 1
    (the child of an archived group is not restricted, because `effective_restriction`
    follows `group_closure` while `archiveGroup` sets `is_archived` on one row), archival is
    the least modelled transition in the system and the one the user is most likely to hit
    while testing by hand.

### CORRECTION to implication 59 (written above — do not use it as stated)

I wrote that `groups.concurrency`'s archive-vs-add race shows "adding a member to an archived
group is explicitly allowed to succeed". **That is wrong.** `addGroupMembers`
(groups.js:698) opens a transaction, does `SELECT is_archived FROM "group" ... FOR UPDATE`,
and throws `createError.Conflict(ARCHIVED_ERROR_MESSAGE)` when the group is archived — the
same shape as `addDatasets` (collections.js:304) for collections. The race test permits
either outcome because the two operations are genuinely unordered, not because the guard is
absent. The test's comment "archiveGroup ... has no precondition guard" is about
`archiveGroup` itself, which always succeeds; it is not about the add.

Read implications 59 and 60 as superseded by 61 below.

### 61. The archived rule has THREE implementations, not one

This is the corrected — and stronger — finding.

1. **The restriction layer.** `effective_restriction` (a view over `group_closure`) plus
   `restrictions.checkRestriction`, wired into the Express middleware. This is the mechanism
   the design intends, and the one the policy engine consults.
2. **Hand-written `is_archived` guards inside the services.** groups.js:349 (update),
   groups.js:658 and :709 (membership writes); collections.js:123 (update), :317
   (addDatasets), :370 (removeDatasets); plus a fourth form inside SQL — addDatasets'
   validation query joins `"group" g` and requires `g.is_archived = false`, so a dataset
   whose OWNER GROUP is archived is rejected with 400 rather than 409, by a different code
   path again.
3. **A comment in both services claiming 1 is authoritative** — groups.js:436 and
   collections.js:185 both say "The restriction is what evaluation reads; is_archived above
   is its denormalisation."

So the services do not trust the layer the comment says is authoritative; they re-check the
denormalised column themselves. Three statements of one rule, with three different failure
modes (409 Conflict, 400 BadRequest, and a 403 from the middleware).

This is item 45's pattern — one rule, many hand-written copies — reaching the restriction
layer, which the plan had treated as the one part already centralised. It is not.

**And it explains F1 exactly.** The create paths (`POST /v2/datasets`, `POST /v2/datasets/bulk`,
`POST /collections`) escape ALL THREE: there is no existing row for a service guard to read,
`restrictionTargetFor` returns null because there is no resource id, and no equivalent of
addDatasets' owner-group join runs. The gap is not that one mechanism was forgotten; it is
that a rule with three implementations has no single place where "creates are also covered"
could have been written once.

62. The plan should therefore treat "archived" as the worked example of a derived fact that
    must have exactly one definition. It is the smallest instance of the whole problem: one
    boolean, one view, six hand-written checks, three error codes, and a create path none of
    them reach.

### CORRECTION 2 to item 61: the denormalisation is honest

`archiveGroup` (groups.js:426) and `archiveCollection` (collections.js:175) each open ONE
transaction and write both the `is_archived` column and the ARCHIVED restriction row
(`restrictionService.applyRestriction`). `unarchiveGroup`/`unarchiveCollection` mirror it with
`liftRestriction`. So the comment "Written in the same transaction so they cannot drift" is
accurate, and the column is a legitimate denormalisation rather than a competing source of
truth. Item 61's framing of "three implementations" is wrong on that point: writing is
centralised.

**Reading is not.** That is where the duplication actually lives, and the count is larger
than item 61 said. `ARCHIVED_ERROR_MESSAGE` is declared FIVE times in FOUR services, with
FOUR different strings:

| file | line | string |
|---|---|---|
| services/groups.js | 22 | `Cannot modify an archived group.` |
| services/collections.js | 25 | `Cannot modify an archived collection.` |
| services/profiles/index.js | 19 | `This resource is archived and cannot be edited.` |
| services/invitations/index.js | 25 | `Group is archived` |

and eight hand-written read sites guard on the column: groups.js 350, 659, 710;
collections.js 124, 318, 371; profiles/index.js 111; invitations/index.js 82. Plus the SQL
form inside `addDatasets` (`g.is_archived = false`), which rejects with 400 rather than 409.

So: one writer, nine readers, four messages, two status codes — and separately the
restriction layer, which the middleware consults and which none of those nine readers use.

### The open question this raises (verify before using)

The group arm of `effective_restriction` is
`FROM active_restriction r JOIN group_closure gc ON gc.ancestor_id = r.group_id`, selecting
`gc.descendant_id AS group_id`. So an ARCHIVED restriction on a parent group reaches every
DESCENDANT group. The `is_archived` column does not: `archiveGroup` sets it on one row.

If that reading holds, the two mechanisms disagree precisely on descendants — the middleware
would refuse a write to a child of an archived group while every service-level guard would
allow it. That also contradicts what I recorded earlier under F1 ("absent for a child of an
archived group, because effective_restriction follows group_closure while archiveGroup sets
is_archived on one group only") — the clause after "because" describes the column, not the
view, so the conclusion drawn from it needs re-deriving. Do not carry either version into the
plan until the dataset arm of the view and `applyRestriction` have been read.

### The descendant question, SETTLED (supersedes the open question above and the F1 sub-claim)

`effective_restriction` has FOUR arms, and its header comment states the intent plainly: "A
restriction on a group applies to the group itself, to every descendant group, and to the
datasets and collections those groups govern. A restriction on a resource applies to that
resource alone."

| arm | join | what it covers |
|---|---|---|
| 1 | `group_closure gc ON gc.ancestor_id = r.group_id` → `gc.descendant_id` | the archived group and every descendant GROUP |
| 2 | + `dataset d ON d.owner_group_id = gc.descendant_id` | every DATASET owned by any of those groups |
| 3 | + `collection c ON c.owner_group_id = gc.descendant_id` | every COLLECTION owned by any of those groups |
| 4 | `r.resource_id IS NOT NULL` | one resource, no closure |

**So the restriction layer IS closure-aware and complete.** My earlier F1 sub-claim — that
ARCHIVED is "absent for a child of an archived group" — is WRONG and is retracted. Archiving
a parent blocks, through the middleware, every mutation on descendant groups and on the
datasets and collections they own.

The `is_archived` COLUMN is the thing that is not closure-aware: `archiveGroup` sets it on one
row. So the corrected statement of the asymmetry is:

- **Through a route, on an existing resource with an id** — the middleware calls
  `restrictionTargetFor`, reads `effective_restriction`, and the descendant case is handled.
  Correct.
- **Through a service, directly** — the nine hand-written guards read `current.is_archived` on
  the single row, so a child of an archived group passes every one of them. Any caller that
  is not an authorized route (another service, a worker, a script, a seed, a cron) gets the
  un-closured answer.

`applyRestriction`/`liftRestriction` confirm the write side is sound: exactly one of
`group_id`/`resource_id` (asserted), `ON CONFLICT DO NOTHING` against a partial unique index,
and lift closes the row rather than deleting it. The backfill in the migration seeds the table
from the existing `is_archived` columns, so the two agreed from the moment the table existed.

### 63. The restriction layer is the ONE part of the design that is already right

It has a single writer, a declared reach, a view that states the rule once in SQL, history
preserved on lift, and a boot-seeded type. The plan should stop treating it as a gap and
start treating it as the **model to generalise** — it is already the shape the plan wants for
every other derived fact: one table, one view expressing the closure, one function to apply
and one to lift, and callers that ask rather than recompute.

What is wrong is everything AROUND it:
- nine service-level guards read the denormalised column instead of asking the view, and so
  answer differently for descendants (items 61 / correction 2);
- the create paths never ask it at all, because `restrictionTargetFor` needs an id (F1);
- `authorizeAction` in authorization/index.js re-implements the middleware's order and does
  not restriction-filter capabilities (item from §5);
- `restrictions.test.js` hard-codes six resource types, so a new container's actions are
  never checked for classification (F4).

64. The right fix for the service guards is therefore NOT to add more checks but to delete
    them in favour of one `isRestricted(target)` helper reading `effective_restriction`. That
    single change removes four constant declarations, four message strings, two status codes,
    and the descendant disagreement. It is the concrete, small piece of work the plan can
    lead with, and it is testable by the precedent already in the repo
    (`listVisibility.test.js`'s four-way agreement check).

## §24 The "reached through a parent" bug class — solved once, not everywhere

`dataset.workflows-and-downloads.test.js` (322) exists, per its own header, because "every
case here is a bug that shipped because nothing called the code". Its most important test:

```js
test('refuses a run reached through a different dataset', async () => {
  // The legacy routes authorize on the workflow alone and never mention the dataset, so
  // holding rights on one dataset lets you act on any run. This is that hole closed: the
  // run exists and the caller may well be an admin of otherDataset, and it is still null.
  await expect(workflowService.findDatasetRun(otherDataset.resource_id, wf_id)).resolves.toBeNull();
  expect(getAll).not.toHaveBeenCalled();   // refused before the workflow service is consulted
});
```

The shape of the fix: the SERVICE takes both the parent id and the child id and returns null
unless the child actually belongs to that parent. Authorization stays on the parent, and the
service guarantees the child is in scope. Two supporting tests pin the same idea —
`listDatasetWorkflows(String(dataset.id))` must be null (an integer key must not resolve where
a resource UUID is expected), and an unknown dataset (null) is distinguished from a dataset
with no runs ([]), so the route can tell 404 from an empty list.

### 65. This is exactly F2 and F5, already solved in one place

Three routes reach a child collection through a parent resource:

| route | child rows | scoped to the parent? |
|---|---|---|
| `/v2/datasets/:id/workflows/:wf_id` | one run | YES — `findDatasetRun` returns null for a foreign run |
| `/v2/datasets/:id/source-datasets`, `/derived-datasets` | lineage rows owned by OTHER groups | NO — services return unscoped rows, and the parent's attribute rule (`['*']` for an owning-group admin) is applied to them (F2) |
| `/groups/:id/ancestors` | ancestor group rows | NO — the caller's standing on THIS group is applied to ancestors (F5) |

So F2 and F5 are not novel defects to argue for; they are the SAME defect the workflow path
already fixed, left in place on two other paths. The plan should present them that way,
because the remedy is already written, tested, and commented in this repo — and because it
makes the case without needing a new abstraction.

66. The general rule the plan should state: **a route may only apply a resource's decision to
    rows that resource owns.** Rows reached through it, but owned by something else, are a
    separate decision. Where that is expensive, the service must at minimum scope the query
    to the parent, which is what `findDatasetRun` does. `derivedIndependence.test.js` already
    pins the principle for lineage ("lineage is recorded but is not an authorization edge");
    the route simply does not honour it.

67. The header comment — "every case here is a bug that shipped because nothing called the
    code" — is direct evidence for the user's original diagnosis. These were not subtle race
    conditions; they were a service queried by integer primary key with a UUID, a route
    calling a function that did not exist, and a sub-router not merging `:dataset_id`. All
    three are what happens when code is written against one imagined call and never
    enumerated against the values it can actually receive.

## §25 The invitations suites (service 403, hook 262, email 219)

These are the best-written tests in the repository, and they are the closest existing thing to
what the plan is asking for.

**invitation.service.test.js** — the header states the two facts everything rests on: "an
invitation names an email address rather than a user, because the person may have no account;
and expiry is the computed condition `PENDING AND expires_at < now()` rather than a status, so
nothing has to catch up with it." Then it enumerates:

- the token: 43 base64url chars = 256 bits, distinct over 100 draws, and never present in the
  listing an admin reads ("An admin managing invitations has no business holding the value
  that accepts one");
- issuing: address normalised on the way in; a non-address refused rather than stored mangled
  (with the reason — `validator.normalizeEmail('not-an-email')` returns `'@not-an-email'`);
  asking twice returns `already_invited` with the same id; **the uniqueness is proved to come
  from the partial unique index, by inserting past the service and asserting P2002**; a
  cancelled invitation does not block a new one; an existing member refused; an archived group
  refused (409); an unknown group 404 not a foreign-key error;
- `INVITATION_STATUS` is asserted to be exactly `['PENDING','ACCEPTED','CANCELLED']` — a test
  that the enum has no EXPIRED member, pinning the "expiry is a condition, not a transition"
  decision against future edits;
- cancelling: `group_id` is part of the MATCH, not only of the authorization above it — "an
  admin of another group cannot cancel this one by id" (404, row untouched). This is the same
  parent-scoping rule as §24, applied correctly here;
- applying: role carried; normalised match; several groups independently; **a group archived
  since the invitation was sent is skipped with `reason: 'group_archived'` and the invitation
  closed as CANCELLED, not fatal**; expired left strictly alone; cancelled not resurrected;
  idempotent when already a member; audit metadata `{ via: 'invitation' }`; and rollback —
  "nothing commits if the transaction fails afterwards".

**invitation.hook.test.js** — tests the extension mechanism itself, which is the pattern the
pinned memory records as the approved shape for touching legacy code. Four registry tests
(order preserved; unknown event is not an error; a throwing handler stops the rest AND
propagates, because atomicity depends on it; registering a non-function throws at once, "not
at the moment it would have run, which could be days later on a rare path"). Then the wiring
test that guards the failure mode the memory names — "a handler nobody registered does nothing
and says nothing" — by evicting only the subscriber module and asserting `count` goes 0 → 1.
Then rollback in three forms, including "the subject row goes too, so no orphan is left for
grants to name". Finally a SOURCE-READING test: the three callers of `createUser` each match
`userService.createUser(` and none matches `/invitation|provision|services\/hooks/i` — an
executable assertion that the legacy edit stayed generic.

### Implications for the plan doc

68. **The enum-completeness assertion is the cheapest technique in the repo and is used
    once.** `expect(Object.keys(INVITATION_STATUS)).toEqual([...])` fails the moment someone
    adds a state, forcing them to visit the code that switches on it. The plan's "all possible
    values" requirement is largely this one line, applied to `GRANT_ACCESS_TYPE`,
    `RESTRICTION_TYPE`, `ACCESS_REQUEST_STATUS`, `GROUP_MEMBER_ROLE`, `RESOURCE_TYPE`, and the
    action list of every policy container.

69. **A test that reads source text is a legitimate boot-time check written as a test.** The
    "none of them was edited" test proves an architectural property no unit test could. The
    plan's static-checks section should say that some invariants are about the shape of the
    code, and that asserting on source text is an acceptable way to hold them.

70. **"Skipped with a recorded reason" is the pattern for a precondition that fails partway
    through a batch.** applyPendingInvitations returns `{applied, skipped}` with
    `{invitation_id, reason}` rather than throwing. Compare the dataset bulk path, which
    returns partial results, and `addDatasets`, which throws BadRequest naming every invalid
    id. Three different answers to one question. The plan should pick one shape for "some of
    the batch could not be done" and say which.

## F6 (NEW, L2) — a stated rationale that no test backs

`tests/services/invitations/invitation.service.test.js` justifies archiving through the
service rather than by setting the column:

```
// Through the service. `is_archived` is a denormalisation of an open ARCHIVED
// restriction, and an invariant test asserts the column and the table agree, so writing
// the column alone leaves the database in a state that suite reports as broken.
```

**No such invariant test exists.** `grep -rn "applyRestriction\|active_restriction\|
effective_restriction\|RESTRICTION_TYPE" tests --include='*.test.js'` returns exactly two
hits, both of which APPLY a restriction to set up a scenario:
- `tests/authorization/platformAdminShortCircuit.test.js:146`
- `tests/services/restrictions/restrictions.test.js:250`

Neither compares the column with the table. And the state the comment calls broken is created
deliberately by another suite: `collections.invariants.test.js:64` does
`prisma.group.update({ where: { id: archivedGroup.id }, data: { is_archived: true } })` with
no restriction row, and its teardown sets it back to false the same way.

So the first half of the comment is true (the column IS a denormalisation, written in the same
transaction by `archiveGroup`) and the second half — the enforcement — is not. The comment is
the only thing telling a reader the column cannot be trusted alone.

Why it matters beyond tidiness: this is the rationale a developer reads before deciding
whether `prisma.group.update({is_archived})` is acceptable. It says a test will catch them. No
test will. Under CLAUDE.md's "a stated rationale is a claim to check", this is the documented
case — and the invariant it describes is one worth actually writing, because it is the only
thing that would hold the denormalisation honest against direct writes.

Note this does NOT weaken the earlier finding: `archiveGroup`/`archiveCollection` genuinely do
write both in one transaction. The gap is that nothing stops anything else from writing only
the column, and `collections.invariants` already does.

## §26 The import suites (dataset.import 192, import_sources 272)

A separate authorization surface that the policy engine never sees. `importDataset` decides
by asking whether the caller may browse the source directory:

- registers a directory inside a source the caller can browse (`create_method: 'IMPORT'`);
- **refuses a directory in another group's source** — `/import source you can import from/`;
- refuses a directory in a SUSPENDED source — `/not readable/`;
- refuses a directory another dataset already holds, **naming neither the dataset nor the
  group** ("Two datasets over the same bytes would mean each set of grants exposes the other's
  files. The message must not say who holds it.");
- answers `dataset: null` when the group already holds the name.

`import_sources.test.js` covers `listImportSourcesForUser` (a group's own sources only; a
suspended source is listed WITH its reason rather than hidden; `mounted_path` is never leaked,
"which is an API deployment detail"; a user with no groups sees nothing),
`resolveImportSourceForUser`, `browseImportSource` (trailing slash, exact path, substring
siblings, extension filter, and "a parent outside the source returns nothing"), and
`verifyImportSourcePaths` (suspends a vanished path, restores it when back, **leaves a
human-made suspension alone even when readable**, stamps `path_verified_at`).

### Implications for the plan doc

71. **Import is a fourth decision surface, alongside policies, list SQL, and the restriction
    layer.** "May this user import from this path" is answered by
    `resolveImportSourceForUser` against group membership, with no policy, no action name, and
    no attribute rule. It reaches the same conclusion by a different route, and a derived app
    extending the engine would not find it. The plan's inventory of where access decisions
    live is incomplete without it.

72. **Two good properties here are worth generalising.** First, the error message that refuses
    without disclosing — the duplicate-path test asserts the message does NOT contain the
    other dataset's name or its group. That is the same concern as `public.js`'s
    `hideRefusals` (403→404) stated at the message level, and the plan should name
    non-disclosure as a property that applies to every refusal, not two places that each
    thought of it. Second, "leaves a suspension a person made alone, even when readable"
    distinguishes an automatic state from a human decision over the same column — a
    distinction the archived/restriction layer does not currently draw (`liftRestriction` does
    not care who applied it).

## §27 seed_baseline.test.js (208) — the boot-time static check, already written

Lives at `tests/seed_baseline.test.js`, NOT under tests/services, which is why I nearly missed
it. Touches no database: it points `global.__basedir` at a temp fixture dir and reads
`@/constants`. Two halves.

**Half one — the seed readers refuse rather than guess.** `collectUsersFromJSON` and
`collectImportSourcesFromJSON` name the file and index in every message
(`users.json[0] is missing email`), report EVERY problem in one pass rather than the first,
refuse the same person in two files, refuse two people sharing a username (case-insensitively),
refuse a relative import path, and refuse a repeated one. This is CLAUDE.md's "refuse rather
than fall back to a default" applied to configuration.

**Half two — "the seeded configuration is self-consistent".** This is the static check:

| assertion | what it prevents |
|---|---|
| every user file confers a role that exists | a seed file pointing at a deleted role |
| every access type implication names an access type that exists | a dangling edge in the partial order |
| every preset names access types that exist | a preset that half-expands |
| every preset is scoped to `['COLLECTION']` | pins a design decision |
| category labels' keys equal the enum's values, in order | a category with no heading in the UI |
| no two access types share `${category}:${sort_order}` | a nondeterministic form order |
| every access type states `is_requestable` as a boolean | an undefined read as falsey |
| every preset is made of REQUESTABLE types | "a type in it that cannot be requested would be refused only at submit" |
| no access type name ends `:REQUEST_ACCESS` | pins the retirement of REQUEST_ACCESS |
| ids and names unique | two types colliding |

### Implications for the plan doc

73. **The user asked that the new design keep "static checks before the server starts". Those
    checks already exist in two forms, and the plan must name both.** (a) Construction-time
    validation inside the engine — `new Policy({...})` validating `requires`, `userHasGrant`
    checking `VALID_GRANT_NAMES`, `PolicyContainer.freeze()`. These fail the process on
    import. (b) `seed_baseline.test.js`, which checks the CONFIGURATION TABLES the engine
    reads and fails CI rather than the process. The second is the one the plan's action table
    and access-type order need, because those are data, not code.

74. **Steal the failure-naming idiom.** `expect([t.name, cond]).toEqual([t.name, true])` makes
    a failing exhaustive check say WHICH row broke. Every "for all values" test the plan asks
    for should use it; a bare `expect(cond).toBe(true)` inside a loop is nearly useless at 2am.

75. **The "total function" check is the repo's existing answer to "all possible values", and
    it appears three times independently**: `seed_baseline` (every preset type requestable),
    `invitation.email.test.js:156` ("every type has a route, so none can be added and
    forgotten"), and `dataset.workflow-gating.test.js` (every configured action exists on the
    container). Three authors reached for the same shape. The plan should name it once, as a
    required test for every mapping table, rather than leaving it to be re-invented — and
    should note that `restrictions.test.js` is the place it was NOT applied, which is F4.

## §28 Two deliberate non-edges

Both suites exist to assert that something which LOOKS like an access input is not one.

**dataset.attribution.test.js — describe('attribution is not governance')**
- "an affiliated group gains no access to the dataset": `userHasGrant` is false before AND
  after `recordAffiliations` names that group. Comment: "Crediting a group says who did the
  work, not who may read it."
- "the owning group is unchanged by any of it".
- Also validates the shape: an affiliation names EXACTLY ONE of a group or an organization,
  refused both ways — the same exclusive-or `applyRestriction` asserts for group/resource.

**dataset.use-conditions.test.js — describe('nothing enforces them')**
- "a condition on a dataset does not change who can reach it", using DUO:0000021 "ethics
  approval required" — "The strictest-sounding condition in the vocabulary confers and
  withholds nothing."
- `datasetsWithUseCondition` exists to FIND datasets by code; that is all the table is for.

76. **A model of this system must state its non-edges as explicitly as its edges.** Four are
    already pinned by tests: lineage (`derivedIndependence`), attribution, use conditions, and
    collection membership as history rather than a live edge. A reader of the current code
    cannot tell which relations are authorization inputs without running the tests; the plan's
    relation inventory should carry an "is this an access edge?" column with these four
    answered NO, each citing its test. This also directly answers the user's "all the access
    is based on grants, but the UI likes to show roles" — the UI shows affiliations and
    conditions too, and neither is access.

## §29 Route-level authorization tests (tests/routes/)

Inventory (I previously recorded this directory as one file; it is five):
`access_requests.create.test.js`, `auth.invite.test.js`, `groups.invitations.test.js`,
`health.test.js`, and a nested `auth/` directory.

All use the same harness: a bare `express()` app, `express.json()`, a middleware that sets
`req.user = currentUser` (a module-level variable each test assigns), the REAL router, and the
real `errorHandler`. The comment says why: "The routes read `req.user` and nothing else off
the request, so authentication is a switch the tests set. Mounting the whole app would start
the TUS server for no gain."

**groups.invitations.test.js (301)** — who may reach the three invitation routes.
- a group admin may invite (201); an ordinary member may not (403) — "Inviting is
  add_member's authority, and membership never confers it"; an outsider may not (403);
- reading the list and cancelling need the same admin authority (both 403 for a member);
- **anti-enumeration**: "an address with an account and one without are indistinguishable" —
  same status, same response keys, same `status` value, differing only by invitation id.
  Rationale: "a group admin who could tell would be able to enumerate the portal's users one
  address at a time";
- the token is never in any response, checked three ways including that the raw token value
  does not appear anywhere in the listing JSON under another key;
- setup notes a fact worth remembering: **"Creating a group does not make the creator an admin
  of it"** — the suite has to insert the `group_user` ADMIN row explicitly.

### Implications for the plan doc

77. **THE ACTION COUNT IS EXPLAINED, and it changes the action table's meaning.** The test
    says plainly: "Two actions, invite and view_invitations, and both are `isGroupAdmin`. They
    are split because ARCHIVED treats them differently, not because a different person holds
    them."

    So the 73 actions are NOT 73 distinct authorities. They are the product of two independent
    classifications that the current design collapses into one name:
    - WHO may do it (the policy) — a much smaller set; on groups, largely `isGroupAdmin`,
      `hasGroupOversight`, `isGroupMember`, `platformAdminOnly`;
    - WHETHER a restriction blocks it (mutating vs reading) — a two-valued fact.

    The plan's action table should therefore have both columns, and the design should let an
    action declare its restriction class rather than encoding that distinction by splitting
    action names. That single change removes the hand-written `MUTATING_ACTIONS` /
    `READING_ACTIONS` lists (72 entries) that F4 shows nothing checks for completeness, and it
    shrinks the table a reader has to hold in their head.

78. **F4 is no longer a judgement call; it is an inconsistency with a sibling test.**
    `dataset.upload-status-filter.test.js:78` — "classifies every upload status exactly once",
    with the stated reason "a status added to the enum cannot ship unclassified". That is
    EXACTLY the missing check for actions: `restrictions.test.js` hard-codes six resource
    types, so `audit.read_records` is classified by neither list and nothing notices. One
    author wrote the exhaustive version for upload statuses; another wrote the enumerated
    version for actions. The plan should cite the upload-status test as the fix's template.

    Total-function checks now found in FOUR places: seed_baseline (presets ⊆ requestable),
    invitation.email:156 (every notification type has a route), dataset.workflow-gating (every
    configured action exists on the container), dataset.upload-status-filter:78 (every status
    classified once). Not found where it matters most: action → restriction class.

79. **Non-disclosure is a system property asserted in three unconnected places** and named in
    none: `public.js`'s `hideRefusals` (403→404), the import duplicate-path message ("must not
    say who holds it"), and invitation anti-enumeration. The plan should state it once as a
    property of every refusal, with these three as the existing evidence.

### Corrections to my own inventory

- `tests/services/uploads.test.js` does NOT exist. The only suites directly under
  tests/services are `nonce.test.js` and `system_accounts.test.js`. Remove "uploads 149" from
  the remaining-files list.
- `tests/routes/` holds FIVE entries, not one, including a nested `auth/` directory.
- `dataset.name-available.test.js:116` — `getOwnerGroupForAuthorization` "returns nothing for
  an archived group, which takes no new datasets". This CONFIRMS the F1 finding that the
  archived check is present on the name-available path, and narrows F1 further to the create
  routes that do not call it.

## CORRECTION 3 — implication 64 is WRONG. The service guards are the second line by design.

I wrote that the nine hand-written `is_archived` guards should be deleted in favour of one
`isRestricted(target)` helper reading `effective_restriction`. That would remove a deliberate
protection. `tests/routes/groups.invitations.test.js` states the design:

```js
test('an archived group takes no invitation, and the restriction is what says so', async () => {
  // The caller is an admin here, so the policy passes and ARCHIVED refuses. That matters
  // beyond the status code: a blocked capability is also absent from the capability map,
  // so the UI never offers the button. The service's own 409 is the second line, reached
  // only if a group is archived between the check and the write.
  expect((await post({ email: 'dana@university.edu' }, archived.id)).status).toBe(403);
```

So the intended layering is explicit and three-deep:

| line | mechanism | who sees it | when it fires |
|---|---|---|---|
| 0 | capability map omits the action | the UI — the button is never offered | always |
| 1 | middleware `checkRestriction` → `effective_restriction` | 403 | on every authorized route |
| 2 | service `is_archived` guard, under `FOR UPDATE` | 409 | only in the window between check and write |

Line 2 is a TOCTOU guard, not duplication. Deleting it would open exactly the race its
`SELECT ... FOR UPDATE` exists to close. **Implication 64 is retracted.**

### 64b (replaces 64) — the real defect is that the two lines use different reaches

Line 1 asks `effective_restriction`, which follows `group_closure` and therefore covers
descendant groups and the datasets and collections they own. Line 2 reads `is_archived` on a
single row, which `archiveGroup` sets on one group only.

They agree for the group that was archived directly. They disagree for a DESCENDANT: if a
parent is archived in the window between line 1 and line 2, line 2 does not fire, because the
child's own column is still false. The TOCTOU guard has a hole exactly where the hierarchy is
involved.

The fix is small and preserves the design: line 2 should ask the same question line 1 asks,
against the same view, inside its existing `FOR UPDATE` transaction. One helper,
`isRestricted({group_id})` reading `effective_restriction`, called where the nine guards read
the column. The guards STAY; only the predicate changes. That keeps the 409, keeps the lock,
keeps the second line, and makes the two lines agree.

This also subsumes F6: the reason nothing catches a direct `prisma.group.update({is_archived})`
is that the column is load-bearing for line 2. Once line 2 reads the view, the column is purely
presentational, and the two test suites that write it directly
(`collections.invariants.test.js:64`, and now also `dataset.name-available.test.js:117`, which
does the same thing to exercise `getOwnerGroupForAuthorization`) stop being a hazard.

### 77 confirmed by a second citation

Same file: "and the outstanding invitations are still readable while it is archived" — "The
reason view_invitations is its own action. An admin explaining why nobody can join needs the
list, and freezing the group is not a reason to hide it."

So the split of `invite` from `view_invitations` is driven ENTIRELY by the restriction class,
and the test says so twice. Implication 77 (the action table needs a separate
restriction-class column, rather than encoding the distinction in action names) now rests on
two explicit statements in the code's own tests, not on my inference.

## §30 auth.invite.test.js (283) and dataset.delete.test.js (176)

**auth.invite — a capability token whose subject is server-side.**

`/check` (unauthenticated) and `/apply` (authenticated) spend an invitation token. The header
states the design: "The invited address lives in the row and not in the token, so the server
decides who a link belongs to."

- **Uniform refusal, four causes.** `test.each` over an unknown token, an expired one, a
  cancelled one, and one whose group has been archived — all four answer HTTP 200 with
  `{ status: 'invalid' }` and nothing else. The comment: "One shape for every failure. A
  reason would tell an unauthenticated caller the state of somebody else's invitation; it goes
  to the log instead." An empty token is a 400 before any lookup.
- **A forwarded link fails for whoever else signs in** — 403, and `res.body.message` is
  asserted NOT to contain the invited address, the membership is not created, and the
  invitation stays PENDING.
- checking does not spend it; spending twice is 404 the second time with one membership;
  **three concurrent `apply` calls yield exactly one 200 and two 404s** and one membership
  row, serialised by `SELECT FOR UPDATE`.
- an archived group gives 409 AND closes the invitation with
  `cancellation_reason: 'group_archived'`, "so it stops appearing as outstanding".
- **"The existing membership is not upgraded. An invitation is not a way to change a role."**
  Someone invited as ADMIN who is already a MEMBER stays a MEMBER; the invitation closes
  ACCEPTED.

**dataset.delete — two mechanisms that look alike and are not.**

- `softDelete` sets `is_deleted`, appends a DELETED state, writes an audit row, and leaves the
  row in place. "'Deleted' is a flag, not an absence."
- **The `resource` row survives a soft delete, "so grants and requests still resolve".**
- An ARCHIVED dataset (one with an `archive_path`) starts a `delete` WORKFLOW instead of being
  marked, and `is_deleted` stays false until the workflow succeeds.
- A hard row delete fires a DATABASE TRIGGER that removes the `resource` row: "No application
  code deletes this."
- **`grant.resource` is ON DELETE RESTRICT, and creating a v2 resource seeds an owning-group
  grant, so a hard delete is blocked until grants are cleared** — and the dataset is left
  whole rather than half removed.

### Implications for the plan doc

80. **Non-disclosure is now evidenced FOUR times and specified zero times** — `hideRefusals`
    (403→404), the import duplicate-path message, invitation anti-enumeration, and this
    four-cause uniform `invalid`. The last is the most complete statement of the idea in the
    repo and should be the one the plan quotes. The plan should require that a refusal's SHAPE
    is a function of the caller's entitlement, not of the reason, and note the tension it
    creates with debuggability — which this code resolves by logging the reason server-side.
    That resolution should be stated once as policy rather than rediscovered per route.

81. **The subject of a capability is never taken from the client.** The token names the
    invitation; the ROW names the person; `/apply` compares the row's address to
    `req.user`. This is the same rule as `access-request`'s `subject_id` and as
    `restrictionTargetFor` reading `preFetchedResource.resource_id` rather than a body field,
    and it is the rule the bulk-create memory is about (a bulk route keeps the per-item body
    so authorization sees each item's real owner). Worth stating once in the plan as an
    invariant: **no authorization input is read from the request body.** It is cheap to check
    statically — grep the policy layer for `req.body` — and it is exactly the kind of property
    the user's "static checks before the server starts" requirement should cover.

82. **The `resource` row's lifecycle is enforced by a database trigger and a RESTRICT foreign
    key, not by application code.** A dataset cannot be hard-deleted while any grant names its
    resource, and the resource row cannot outlive the dataset. The plan's relation inventory
    must record which invariants are held by the schema rather than by services, because those
    are the ones a derived app cannot accidentally break and the ones a JS-only model of the
    system would misrepresent. This is also the strongest argument for the user's original
    instruction that the rule belongs near the data: three of this system's load-bearing
    invariants (grant_no_overlap, the partial unique indexes, this trigger) are already there.

83. **"An invitation is not a way to change a role" is a privilege-escalation rule stated in a
    test and nowhere else.** The general form — an accept/apply path may grant the standing it
    names, but must never RAISE standing the subject already holds — should be in the plan as
    a named property, because the same shape recurs in grants (a preset must not widen an
    existing grant's expiry downward), in membership (promote/demote), and in access requests.

## §31 Closing the read-through

**Inventory confirmed:** 68 test files, 17,882 lines, which matches the count established
earlier. Correction to my own §29 correction: `tests/services/uploads/dataset.upload_v2.test.js`
(149) DOES exist — it is in an `uploads/` SUBDIRECTORY, not directly under tests/services.
My "uploads.test.js does not exist" note was right about the path and wrong about the file.

**invitation.email.test.js (219)** closes two loose ends.

- **A threat-model statement found nowhere else in the codebase:** "A group admin picks the
  group name and can invite anyone, so the name is attacker input. Handlebars escapes by
  default, which is why no explicit encode call exists." The test renders a group name of
  `<a href="https://evil.example">Click here</a>` and an inviter name of `<script>alert(1)</script>`
  and asserts neither survives.
- The `href` assertion is deliberately written in ESCAPED form
  (`token&#x3D;abc`) with the reason given: "so switching to <span v-pre>`{{{acceptUrl}}}`</span> fails here
  rather than silently". A test written to fail on a specific future edit.
- A SECOND source-reading test: `preloadTemplates` "carries a hardcoded list. A template
  missing from it still renders, just cold, and nothing else would notice" — asserted by
  regex against `templateRenderer.js`.
- A third total-function check: "every type has a route, so none can be added and forgotten".
- A mail failure returns `false` rather than throwing: "The caller has already committed the
  invitation. A mail failure must not undo it."

### Implications for the plan doc

84. **Group and collection names are attacker-controlled input, and only one place says so.**
    A group admin chooses the name and can invite arbitrary addresses, so the name reaches
    strangers. The same strings flow into audit `target_name` (via `resolveEntityName`),
    into in-app notification titles (asserted to contain `dataset.name`), and into every
    listing. The email template is the only place the exposure is named and defended. The
    plan should carry a short data-provenance note: which fields are user-chosen, where they
    are rendered, and what escapes them — because this is a property of the whole system that
    currently lives in one test comment.

85. **Source-reading tests are established practice here, not an oddity** — three instances
    now (the hook's "none of them was edited", the template preload list, and the escaped-href
    assertion that fails on a specific future edit). Implication 69 stands and strengthens:
    the plan's static-checks section can rely on this technique being already accepted by the
    codebase's own conventions.

### STATUS: the read-through is complete.

Covered in full: all of `api/src/authorization` (core, builtin, custom), every caller outside
it (`api/src/routes/*`, the services that invoke `authorizeAction`, `restrictions.js`,
`grants/`, `datasets_v2/`, `collections.js`, `groups.js`, `invitations/`, `profiles/`,
`imports/`, `access_requests/`), the restriction-layer migration SQL, and all 68 test files.

The notes now carry 85 numbered implications, six candidate defects (F1–F6), and FIVE
corrections to my own earlier conclusions (the two on the archived rule, the descendant
question, implication 64, and the uploads path). The corrections matter as much as the
findings: three of my first-pass conclusions about the restriction layer were wrong in the
same direction — I read duplication as accident where it was a deliberate defence in depth.
The design is better than my first reading of it, and the real defects are narrower and
sharper than the sweeping ones I started with.

### The last file: dataset.upload_v2.test.js (149)

`registerUpload` writes the dataset, its deterministic `origin_path`, and its upload log in
ONE transaction, "so there is never a dataset whose upload nobody is tracking". Pinned:
`origin_path` is keyed by dataset ID, not by name, "which is the reason upload needed no path
changes when names became per-group"; two groups may hold the same dataset name and their
upload paths still differ; a duplicate name answers `null` and **leaves no dataset behind**,
because a dataset with no upload log is a row nothing downstream would ever pick up.

86. Three creation paths — import, upload, and plain create — each answer "is this name free
    in this group?" and each answers it differently on failure: import returns
    `{dataset: null}`, upload returns `null`, and create throws. Same question, three return
    conventions, and a fourth (`isDatasetNameAvailable`) that returns `{available}`. This is
    item 70's batch-shape problem again at the level of a single predicate, and it is the
    cheapest possible illustration for the plan's opening argument.

## CORRECTION 6 — F6 IS RETRACTED. The invariant test exists.

`tests/services/restrictions/restrictions.test.js:290`:

```js
describe('the denormalised is_archived column', () => {
  test('agrees with the restriction table for every group and collection', ...)
```

and at :127, inside `describe('an archived group')`, `test('writes a restriction row alongside
is_archived')`.

**Why I got it wrong.** I grepped `tests/services/restrictions.test.js`. The real path is
`tests/services/restrictions/restrictions.test.js` — a subdirectory. grep printed hits from the
other two files in the same command and said nothing about the file that did not exist, so
"no hits" read as "no such test". My own §19 notes, written from actually reading the file,
recorded the assertion correctly. I trusted a later grep over an earlier read.

**Lesson for the rest of this work:** a negative grep result is only evidence when the path is
confirmed to exist. Check `ls` before concluding absence, especially against notes that say
otherwise.

So: the invitations comment is ACCURATE, the plan doc's existing invariant bullet is correct as
written, and F6 is removed from the defect list. Five defects remain (F1–F5).

### What survives, narrower and still worth stating

The agreement test compares ROW SETS: the set of groups with `is_archived = true` against the
set with an open ARCHIVED restriction row. It proves the two are written together. It does NOT
compare REACH, and cannot, because reach is a different question: `effective_restriction`
expands through `group_closure` while the column never does. A child of an archived parent has
`is_archived = false` and no restriction row of its own, so it is correctly absent from BOTH
sets, and the test passes exactly as it should.

That is why 64b stands on its own evidence and does not need F6: the gap is not drift between
the column and the table, it is that line 2 asks a single-row question where line 1 asks a
closure question.

### Corrected counts

- `ARCHIVED_ERROR_MESSAGE`: FOUR declarations (not five), four different strings, four services
  — groups.js:22, collections.js:25, profiles/index.js:19, invitations/index.js:25.
- Guard read sites: ELEVEN — groups 349, 658, 709; collections 123, 317, 370; profiles 111;
  invitations 82, 285, 342, 391 — plus one SQL predicate (`g.is_archived = false` in
  addDatasets). My earlier "eight" missed the three later invitation sites and the two
  destructured collection sites.

## §32 UI read-through (2026-09-15): how the v2 UI consumes API state for gating and projection

Read in full: `ui/src/router/index.js`, `ui/src/services/api.js`, `ui/src/services/v2/*.js` (all
12), `ui/src/stores/auth.js`, `ui/src/stores/v2/uiPersona.js`, every page under
`ui/src/pages/v2/`, every component under `ui/src/components/v2/` (access-requests, grants,
grants/issue, groups, collections, datasets, profiles, dashboard, audit, chips, Badge, RoleBadge,
AuthorityBanner), `ui/src/components/layout/Sidebar/*`, `ui/src/constants.js` (sidebar), and
`ui/src/components/filebrowser/FileTable.vue` (download gating). Nothing was run. All claims
below are from reading; line numbers are as of the working tree on the `access-model` branch.

### 32.1 The four sources of "who am I" in the UI

The UI has FOUR independent sources of caller identity/authority, and no page says which one
it is using or why.

| Source | Where it comes from | What reads it |
|---|---|---|
| S1 JWT profile in localStorage | `stores/auth.js` — `hasRole('admin')` from token `roles` (case-insensitive), `canAdmin`, `canOperate`, `user.subject_id` | Sidebar `admin_items`/`operator_items` (`Sidebar/index.vue:15,21`); `pages/v2/groups/index.vue:21,168,178` (Create Group button + default scope); `MyAccessTab.vue`, `UserToken.vue`, `access-requests/[id].vue:189` (`requester_id === auth.user.subject_id`) |
| S2 `uiPersona` from `GET /v2/users/me` | `stores/v2/uiPersona.js`; API computes `platform_admin \| group_admin \| standard_user` from `auth.isPlatformAdmin(req)` (JWT roles again) and `groupService.isGroupAdmin(subject_id)` (`api/src/routes/users_v2/index.js:15-40`, with a NOTE saying "not used for access control") | `pages/v2/home.vue` (whole page shape), `pages/v2/collections/index.vue:216` (`canCreate`), `RequestSubjectSelector.vue` ("A group I administer") |
| S3 `_meta.capabilities` + `_meta.caller_role` on detail GETs | `authorize(..., { shouldDeriveCapabilities, shouldDeriveCallerRole })` on `GET /v2/groups/:id`, `/v2/collections/:id` (`routes/collections.js:78-88`), `/v2/datasets/:id` (`routes/datasets_v2/index.js:376-390`), `/v2/access-requests/:id` | Every `[id]` page via `can(x)`; `RoleBadge`; the `GRANT_HOLDER` literal gates |
| S4 per-row flags on list rows | `user_role` (SQL, groups list); `_meta.can_view_metadata` / `_meta.can_request_stage` on collection datasets (`routes/collections.js:240-292`, computed by re-running the check per row) | `home.vue:278,379,702,729`, `GroupCard`, `CollectionDatasetsTab.vue:102,276,280` |

Consequences:
- S1 and S2 both bottom out in the JWT `roles` claim for platform admin, so the "platform admin
  is a JWT snapshot" finding (review item, API side) is reproduced twice in the UI. Persona is
  fetched once per session and never invalidated when a group membership changes.
- S1 (`auth.canAdmin`) is v1's RBAC vocabulary ("admin", "operator", "user") reused as a v2
  gate. The groups list page and the sidebar are the only v2 surfaces that use it. The
  collections list uses S2 for the same decision ("can this caller create?"). Same question,
  two sources, and neither is the API's answer to `authorize('group','create')`.
- S3 is the only source the plan's model actually defines (capabilities = the set of actions
  the decision rule allows). S1, S2, S4 are not derivable from the plan's vocabulary today.

### 32.2 Gating patterns catalogued (with the representative site for each)

P1 **Capability gate** — `can('x')` over `_meta.capabilities`. The dominant and correct
pattern. `groups/[id]/index.vue:125-168` has twelve of them.

P2 **Capability AND restriction re-derived client-side** — `can('x') && !group.is_archived`
(`groups/[id]/index.vue:125-168`), `can('archive') && is_archived === false`
(`collections/[id]/index.vue`), `canArchive && !dataset.is_deleted`
(`DatasetOverviewTab.vue:107`). The API already folds the restriction layer into the
capability set (restriction check precedes policy; `MUTATING_ACTIONS` are stripped on an
archived target), so the client-side `&& !is_archived` is redundant when the API is right and
masking when it is wrong. Two independent definitions of "restricted" that can drift: the API
uses `effective_restriction` (closure-aware); the UI uses the row's own `is_archived` (not
closure-aware) — same shape as 64b on the API side.

P3 **Role-literal gate** — `callerRole === 'GRANT_HOLDER'` decides whether the Access tab
exists: `datasets/[id]/index.vue:120` (`can('manage_grants') || GRANT_HOLDER`) versus
`collections/[id]/index.vue:91` (`can('list_grants') || GRANT_HOLDER`). Dataset has no
`list_grants` action, so a dataset OVERSEER (ancestor admin) gets no Access tab even though the
API lets them list grants; a collection overseer does. Also `home.vue:702,729` branches on
`user_role === "OVERSIGHT"` / `"TRANSITIVE_MEMBER"` strings, and `RoleBadge.vue` has no entry
for `RESOURCE_ACCESS` (renders the raw token). Role names are therefore a UI contract with no
owner: the API derives them by first-match attribute rules, the UI hardcodes them in five
places, and the plan currently says the badge vocabulary is undefined.

P4 **Identity re-derived client-side** — `request.requester_id === auth.user?.subject_id`
(`access-requests/[id].vue:189`) gates Withdraw; `UserToken.vue` renders "you" by the same
comparison. The API has a `withdraw` capability it could hand down; the UI computes it from S1
instead, so a stale localStorage user (or a platform admin looking at someone else's request)
gets a different answer than the API's `authorize`.

P5 **State-machine re-derived client-side** — `canReview = capabilities.has('review') &&
status === 'UNDER_REVIEW'` (`access-requests/[id].vue:181-184`); `canWithdraw` requires
`status ∈ {DRAFT, UNDER_REVIEW}`; `AccessRequestCard.vue` `canAct && status === 'UNDER_REVIEW'`.
The status precondition is duplicated because the API's capability is state-blind (the
policy for `review` does not read `status`). This is the UI-side symptom of review item
"resource state (status machines) missing from the decision rule": the UI has to know the
machine because the capability does not encode it.

P6 **"Active grant" computed two different ways** — `GrantsBySubjectPanel.vue:135,141`:
active ⇔ `revoked_at === null` (ignores expiry entirely); `SubjectPanelHeader.vue:99`: active ⇔
`revoked_at == null && daysUntilExpiry >= 0` (ignores `valid_from`, and `daysUntilExpiry`
floors to whole days so a grant expiring later today reads as active with 0 days). Neither
matches the SQL definition (`valid_from <= now() AND (valid_until IS NULL OR valid_until >
now()) AND revoked_at IS NULL`). Two client definitions, one server definition, none the same.

P7 **Inverse-capability gate** — "Request Access" appears when `!canIssueGrants`
(`DatasetOverviewTab.vue:221`), i.e. the UI infers "may request" from "may not grant". The API
has a `request_access`-shaped decision (the create route for access requests), which is not
what is being tested. A platform admin who can grant is never offered Request Access (fine); a
member of an archived group who cannot grant is offered it (the request will 403/409).
`DatasetRequestsTab.vue`/`CollectionRequestsTab.vue`: `canReview` selects WHICH list is
fetched (pending-for-review vs requested-by-me), so a reviewer never sees their own requests on
the resource tab. That is a projection decision made by the client from a capability, not a
capability decision.

P8 **Projection-presence gate** — `showsMemberUploads = allow_user_contributions != null`
(`GroupOverviewTab.vue:222-224`) with a comment saying the API's attribute filter decides.
This is the one place the UI consciously relies on projection as the signal. It works only
because `allow_user_contributions` is NOT NULL in the schema; it would silently hide the cell
for any nullable field. It also means the API's attribute rule set is a UI contract: a change
to `group_attributes` that starts returning the field to non-members changes what the UI
shows, with no test on either side.

P9 **Client-side implication reasoning** — `RevokeGrantModal.vue:233-281` decides whether
revoking grant G still leaves the subject with access type T by walking `accessTypeMap[..].implies`
over `siblingGrants` (the subject's other DIRECT grants on this resource only). It ignores
group-path and collection-path coverage, so "they will lose X" is wrong whenever coverage
comes through a group or collection. Contrast `useSubjectCoverage.js` and
`GrantPreviewRow.coverageNote`, which ask the API (`getCoverageForSubject`, `computeEffectiveGrants`)
for exactly this and get `via = DIRECT|GROUP|PRINCIPAL`, `via_collection_name`. Two grant
surfaces, one asks the server, one re-implements a subset.

P10 **No route-level gating on v2 pages** — `router/index.js:49-62` honours
`meta.requiresRoles`, but no `pages/v2/**` route declares it. Every v2 page relies on the API
403 (and the `ErrorState` component distinguishing "refusal from failure"). `audit-logs.vue`
has no guard and no sidebar entry (constants.sidebar lists home, groups, collections,
datasets, access-requests only). `datasets/index.vue` has `canCreate = ref(true)`, hard-coded.
This is fine as a security posture (the API is the gate) but means the plan's "UI checks"
deliverable is really "the UI shows the right controls", not "the UI enforces".

P11 **401 handling is global logout** — `services/api.js:30-32` redirects any 401 to
`/auth/logout`. `stores/auth.js:133-149` treats 403/404/409 on invitation acceptance as
"definitive, clear the held token" and only 403 as "refused". Public profile pages use bare
axios (`services/v2/publicProfiles.js`) so a 401 there does not log the user out. The refusal
shape the UI expects is therefore: 401 ⇒ session dead; 403 ⇒ show refusal; 404 ⇒ "gone or
never yours" (indistinguishable by design, matches design.md's existence corollary); 409 ⇒
conflict copy (`RequestAccessForm.vue` in-flight conflict alert reads `preset_ids`/`access_type_ids`
from the 409 body). The plan's refusal table needs all four plus the 409 body contract.

P12 **Per-row capability flags vs capability arrays** — collection datasets carry
`_meta.can_view_metadata`/`_meta.can_request_stage` (booleans named after the action), computed
by the route re-running the check per row (`routes/collections.js:240-292`). Detail routes
carry `_meta.capabilities` (an array of action names). Group lists carry `user_role` (a
role, not a capability). Three shapes for "what may the caller do with this row". The
plan should pick one (array of action names on every row that needs it) or the UI keeps
three code paths.

P13 **Download and copy-path surfaces** — `DatasetDownloadModalV2.vue` offers three options:
per-file download (FileTable, gated by `showDownload` prop passed from the page's
`can('download')`), archive download via `getBundleDownloadInfo` (API mints the scoped
token; comment: "The v2 endpoint enforces the dataset.download grant; the legacy one does
not"), and "IU Storage" copy-path, which is gated by nothing and logs via the v1 statistics
endpoint. The copy-path option leaks `config.paths.download/<stage_alias>` to anyone who can
open the modal; whether that is a decision surface belongs in the plan's downloads item.

P14 **Edit modals do not carry capabilities** — `DatasetEditMetadataModal`, `GroupEditMetadataModal`,
`CollectionEditMetadataModal`, the three archive modals, `CollectionAddDatasetModal`,
`RevokeAllGrantsModal` all assume the parent gated them and surface `err.response.data.message`
on failure. `DatasetEditMetadataModal` and `DatasetDeleteConfirmModal` swallow the API
message and show a fixed string ("Failed to update dataset.", "Failed to delete dataset.")
so a 403 with a reason is invisible.

*Resolved 2026-09-15, second half:* the component was `DatasetArchiveConfirmModal`, titled
"Delete Dataset" and calling `DatasetService.archive`, so the UI vocabulary and the action
vocabulary disagreed on the same button. The action is now `dataset.delete` on
`DELETE /v2/datasets/:id`, and the component is `DatasetDeleteConfirmModal`. The swallowed
message is untouched and still open.

P15 **Group/collection archive modals state the rules in prose** — `GroupArchiveConfirmModal`
lists PRESERVED/PROHIBITED AFTER ARCHIVE ("Create new grants or revoke existing grants",
"Create new datasets", "only a Platform Admin can unarchive"); `CollectionArchiveConfirmModal`
similarly ("Update grants"). These are hand-written restatements of `MUTATING_ACTIONS` and
`ARCHIVED_EXEMPT_ACTIONS`. Nothing ties them to the constants, so they are a fifth place the
restriction semantics live (after the four `ARCHIVED_ERROR_MESSAGE` strings). The plan's
restriction table should be the source these strings are generated from or checked against.

P16 **Subject selection offers PUBLIC/AUTHENTICATED principals** — `SubjectSelector.vue`
quick-selects `constants.PUBLIC_GROUP` and `constants.AUTHENTICATED_USERS_GROUP` alongside the
owner group. So grants to system principals are a first-class UI path, and `coverageReason`
already handles `via === 'PRINCIPAL'`. The plan's world dimensions must include "grant to a
system principal" as a subject kind, not only user/group.

P17 **Access-type implication is enforced client-side in the request/issue forms** —
`AccessTypeSelector.toggle` removes implied types when a wider type is picked, and
`RequestAccessForm.heldReasons` expands coverage rows through `implies`. Whether the API
also normalises (rejects a request naming both X and its implied Y) is not checked by the UI;
if it does not, the same request submitted by API and by UI produce different item sets.

P18 **`isRequestingForSelf` compares subject ids** (`RequestDetailsCard.vue`,
`RequestContextHeader.vue`) — correct, and the comment records a previous bug where user id
was compared to subject id. Worth a line in the plan: the UI carries both `user.id` and
`user.subject_id` and mixes them; every identity comparison in the UI should be over
`subject_id`.

P19 **List pages lose standing; detail pages have it** — `groups/index.vue` scope filter
(`mine|all` default from `auth.canAdmin`), `collections/index.vue` scope
(`ownership|grants|oversight`), `datasets/index.vue`. The scope names are the plan's "path
kinds" surfaced as UI filters, so the plan's list-standing item has a UI counterpart: the
filter vocabulary is a contract too.

P20 **Dead or half-built authority UI** — `AuthorityBanner.vue` is imported nowhere;
`DatasetAssociatedDatasetsTab.vue:239` has a `TODO: Implement request access flow`; the same
tab links with `row.rowData.id` (`:60`) where every other v2 page links with `resource_id`
(check which the API returns on that row — if it is the dataset row id, the link 404s).

### 32.3 Gaps the plan must cover (UI-side additions to the review items)

G1 The plan's UI section is five lines and its scan looks for role/persona/user_role
literals. That finds P3 and nothing else. It needs a scan for every pattern above.

G2 The plan defines capabilities but not: caller_role vocabulary, per-row capability flags,
persona, list scopes, or the refusal-shape contract the UI decodes. All five are UI contracts
today.

G3 The plan should state that the UI is never the gate (P10) and derive from that what the
UI may compute itself. Proposed rule: the UI may show/hide on a capability the API sent and
on a display-only fact; it may NOT re-derive restriction (P2), identity (P4), state (P5),
grant activity (P6), implication (P9), or "may request" (P7). Each of those becomes a
capability or a projected field the API sends.

G4 Projection-presence gating (P8) means the attribute rules are a UI contract. Either the
plan lists which fields the UI reads as "present ⇒ permitted" and pins them with a test, or
the UI stops doing it and the API sends a capability instead.

G5 Three "active grant" definitions (P6) ⇒ the plan's grant table needs one definition and
the API should send `is_active` (or the UI should stop computing it).

G6 The restriction prose in the archive modals (P15) and the persona NOTE ("not used for
access control") are stated rationales; the plan should list them as claims to check.

G7 `GET /v2/users` via `UserSearchSelect` is reachable from any subject picker, so the
anti-enumeration item from the API review has a concrete UI consumer that would break if the
API were fixed naïvely. The plan needs to say what a non-admin subject search returns.

### 32.4 How the current plan can address these

- Add a "UI consumption contract" deliverable: for each response shape the UI gates on
  (`_meta.capabilities`, `_meta.caller_role`, per-row `_meta.can_*`, `user_role`, `uiPersona`,
  list `scope`, refusal codes 401/403/404/409 + 409 body), one table row: producer, consumer
  files, whether it is derivable from the decision rule, and the test that pins it.
- Fold P2/P4/P5/P6/P7/P9 into the model as capabilities the API sends (`withdraw`, `review`
  already state-aware, `request_access`, `is_active` on grants, `would_lose` on revoke preview)
  and mark the client re-derivations as code to delete, not to keep in sync.
- Extend the UI scan in the plan from "role literals" to the full pattern list P1–P20, and
  make the scan output a table the plan can re-run.
- Move the archive-modal prose and the ARCHIVED_ERROR_MESSAGE strings under the same
  restriction table so one source generates or checks all of them.
- Add the system principals (PUBLIC, AUTHENTICATED) as a subject kind in the world dimensions,
  with the `via = PRINCIPAL` coverage path as the reason.

## §33 Plan updated (2026-09-15)

The access model verification plan now carries the 20 review items and the §32 UI findings.
The plan has since been folded into `docs/design/groups/access-model.md`, and remains in git
history. What changed, by section: base relations gain `quarantine`, `seeded_grant`,
`profile_visibility`, `contributions_allowed`, `status`; derived relations gain `precondition`
and `resource_rule`; the decision rule gains both and states the platform-admin session
snapshot; "Three tables" is now "Four tables" (transition table added, `Policy.always` list
actions and the `.actions()` slot noted); projection text corrected (`'*'` ignores other paths,
grant listing leaks user rows); refusal table corrected (403 rationale) and extended to
401/403/404/400/409 + 409 body; agreement table gains platform-admin (engine reads JWT),
has-an-admin (three counts), and three UI rows; totality gains unpoliced lists, quarantine exit,
`Policy.always`; new "Disclosure consumers outside the router" (GET /v2/users, notifications,
cache) and "The UI is a consumer with four sources of truth" findings sections; operations
table gains toggle-contributions, visibility change, revoke seeded grant, owner-change/collection
note; invariant table gains same-owner invariant; lists keep per-row standing; badge vocabulary
is a Phase 1 deliverable; persona section covers sidebar/`auth.canAdmin`/`datasets/index.vue`;
"Where the tables live" resolves the tables.js contradiction and the custom/ row mechanism;
reference-model independence caveat; worlds gain stale-session admin, quarantine, seeded grant,
resource-rule and state dimensions, constraint list (840,000 pairs, ~19M decisions); four new
arms (Transitions, Session, Row flags, Unpoliced lists); ten known disagreements; UI layer
section rewritten (rule, contract, scan); Phases 1/2/5/6 extended; decisions 14–19 added.

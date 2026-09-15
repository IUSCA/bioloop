# Access model

The rule that decides every access question in v2, stated over the data it reads. Every
consumer, from the policy engine to a button on a page, gives the answer this page gives.

The verification work that produced this page is in
[Access model verification plan](./access-model-verification-plan.md). Decisions are recorded in
[Decisions](./decisions.md), and the lifecycle effects are in
[Design — Lifecycle Management](./design.md#lifecycle-management).

## Terms

- A **state** is the contents of the access tables at one instant, together with the current time.
- An **operation** changes a state. Adding a member, issuing a grant, and archiving a group are operations.
- A **decision** answers one question: may user `u` take action `a` on resource `r` in state `S`?
- A **consumer** is any code that answers some version of that question. The engine, a list query, a capability map, a badge, and a `v-if` that offers a button are all consumers.
- A **path** is one reason a decision is true.
- A caller's **standing** on a resource is the set of paths for that resource's read action.

## A decision is a tuple

A decision is not a boolean. The engine returns whether the action is allowed, the paths that
allow it, the fields the caller may see, and the shape of the refusal when it is not allowed.

```text
decide(u, a, r, S) = {
  allowed : Bool,
  paths   : Set<Path>,
  fields  : Set<Attribute>,
  refusal : Shape
}
```

Four planes produce the tuple.

| Plane | Question | Where it lives |
|---|---|---|
| Authority | who may act | the policies inside `.actions({...})` |
| Restriction | whether the state blocks it | the restriction class of the action, and `effective_restriction` |
| Projection | which fields the caller sees | the attribute rules inside `.attributes({...})` |
| Disclosure | what a refusal reveals | the refusal shapes below |

A consumer that returns the right boolean and the wrong field set disagrees with the model.

## Base relations

Each base relation is one table or one column. Rows carry validity columns, so a relation is a
set of facts over time.

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
| `quarantine(g)` | `g` is the seeded `Unassigned Datasets` group, which its seed archives | seeded id |
| `seeded_grant(g, r)` | the owning-group grant written when `r` was created | `grant.creation_type = SYSTEM_BOOTSTRAP` |
| `profile_visibility(x)` | who may read the profile of a group or a collection | `profile_visibility` column |
| `contributions_allowed(g)` | members of `g` may register datasets it owns | `group.allow_user_contributions` |
| `status(x)` | the lifecycle state of an access request, an invitation, or a grant | `access_request.status`, `group_invitation.status`, `grant.revoked_at` |
| `import_source(g, path, status)` | group `g` may register datasets under `path` | `import_source` |

Ten access types exist. Their order is a forest.

- `DATASET:DOWNLOAD`, `DATASET:COMPUTE`, and `DATASET:REMOTE_ACCESS` each imply `DATASET:LIST_FILES`.
- `DATASET:LIST_FILES`, `DATASET:VIEW_SENSITIVE_METADATA`, `DATASET:LIST_SOURCE_DATASETS`, and `DATASET:LIST_DERIVED_DATASETS` each imply `DATASET:VIEW_METADATA`.
- `COLLECTION:LIST_CONTENTS` implies `COLLECTION:VIEW_METADATA`.

## Derived relations

Each derived relation has one definition, and every consumer reads that definition.

- **`active(x, now)`** holds when `x` is not removed, revoked, or lifted, its start is not after `now`, and its end is null or after `now`. The views `active_group_user`, `valid_grants`, `active_collection_dataset`, and `effective_restriction` are this predicate.
- **`effective_member(u, g)`** holds when `u` has an active membership in `g` or in any descendant of `g`. Membership flows upward.
- **`admin(u, g)`** holds when `u` has an active `ADMIN` membership in `g` itself. Authority does not flow.
- **`oversees(u, g)`** holds when `u` is admin of a strict ancestor of `g`.
- **`has_admin(g)`** holds when some account that is not deleted has an active `ADMIN` membership in `g`. It is the one definition the last-admin rule and the no-active-admins report both read.
- **`subjects(u)`** holds `u`, every group `u` is an effective member of, Authenticated Users when `u` is signed in, and Public.
- **`holds(u, r, t)`** holds when some active grant has its subject in `subjects(u)`, names `r` or a collection that actively contains `r`, and carries a type that implies `t` through the closure.
- **`restricted(r, a)`** holds when an active restriction blocks the restriction class of `a`. The restriction may sit on `r`, on the owning group of `r`, or on an ancestor of that group. Every action declares one of three classes: `mutating`, `reading`, or `data`, which reads a dataset's bytes. ARCHIVED blocks `mutating`. DELETED holds on every soft-deleted dataset and blocks `mutating` and `data`. Neither blocks `unarchive`.
- **`precondition(a, x)`** holds when the state of `x` admits `a`, according to the transition table below.
- **`resource_rule(a, r)`** holds when a term that reads only columns of `r` admits `a`. Today that is `view_profile` when the profile is `PUBLIC`, or `AUTHENTICATED` for a signed-in caller.

## The decision rule

```text
allowed(u, a, r) =
  not restricted(r, a)
  and precondition(a, r)
  and ( platform_admin(u)
        or resource_rule(a, r)
        or structural(u, a, r)
        or holds(u, r, required_type(a)) )
```

`structural(u, a, r)` covers the terms that need no grant.

- `admin` of the owning group admits the governance actions.
- `admin` or `oversees` admits the governance reads.
- `effective_member` of the owning group, together with `contributions_allowed`, admits `dataset.contribute` and `group.add_dataset`.
- `effective_member` admits the group reads a member is entitled to: `view_metadata`, `view_members`, and `view_ancestors`.

`platform_admin(u)` is read from `user_role` once per request. The JWT carries identity, not
authority, so a role revoked after login stops applying on the next request.

The restriction check runs before the platform-admin check. An archived group is archived for a
platform admin too.

A create action has no resource yet. Its restriction target is the owning group it names, so an
archived owner or an archived ancestor of that owner blocks it.

## Paths and standing

A path takes one of seven forms.

| Path | Holds when |
|---|---|
| `platform_admin` | `platform_admin(u)` |
| `admin(g)` | `admin(u, g)` and `g` owns the resource, or is the resource |
| `oversight(g)` | `oversees(u, g)` for that group |
| `member(g)` | `effective_member(u, g)` for that group; records whether the membership is direct |
| `grant(id)` | the grant `id` reaches `u`; records its subject and the collection it arrived through |
| `resource_rule(name)` | a column rule admits the read, such as `profile_public` |
| `self` | the caller is the resource's own party: the user subject of a grant, or the requester of an access request |

Standing is a set. A caller can hold several paths at once, and every consumer that shows
standing shows all of them.

### The badge vocabulary

A badge is a display of standing. It gates nothing, and tabs and buttons gate on capabilities
only. When a caller holds several paths, the badge shows the first row that matches, and the
standing panel lists every path.

| Precedence | Path | Badge on a group | Badge on a dataset or a collection |
|---|---|---|---|
| 1 | `platform_admin` | `PLATFORM_ADMIN` | `PLATFORM_ADMIN` |
| 2 | `admin(g)` | `ADMIN` | `ADMIN` |
| 3 | `oversight(g)` | `OVERSIGHT` | `OVERSIGHT` |
| 4 | `member(g)`, direct | `MEMBER` | not produced |
| 5 | `member(g)`, through a descendant | `TRANSITIVE_MEMBER` | not produced |
| 6 | `grant(id)` | `RESOURCE_ACCESS` | `GRANT_HOLDER` |
| 7 | `resource_rule(name)` | `PROFILE_VIEWER` | `PROFILE_VIEWER` |

Membership of the owning group confers no dataset path by itself. A member reads a dataset their
group owns through the seeded grant, so their badge there is `GRANT_HOLDER`.

## Projection

An attribute filter is a list of path patterns applied by `projectObject`.

| Form | Example | Meaning |
|---|---|---|
| Nested path | `owner_group.name` | one key, reached by walking |
| Array wildcard | `items[*].id` | that key in every element |
| Wildcard | `*` | every top-level key of the source; other positive paths in the list add nothing |
| Negation | `!assignor` | removed after every positive path, wherever it sits |

A caller who holds several paths sees the union of what each path confers. The union is over
projected key sets, not over pattern lists, because concatenating a list with a negation onto a
permissive list removes keys the permissive rule granted.

```text
fields(u, a, r) = ⋃ { keys(project(r, filters(a, k))) : k ∈ path_kinds(u, r) }
```

A filter is valid only for the resource whose decision produced it. A route that returns related
rows, such as lineage or ancestors, decides each row on its own resource.

`*` is never used where a row embeds another user's record. A grant row names the fields it may
carry of its subject, grantor, and revoker.

## Refusal shapes

A refusal's shape is a function of what the caller is entitled to know, never of the reason it
failed. The reason goes to the log.

| Status | When | What the caller learns |
|---|---|---|
| 401 | no session, or an expired one | nothing about any resource |
| 403 | a signed-in caller who holds standing on the resource, refused an action; or any refusal by a container other than dataset, collection, or group | the action is refused, and a restriction names itself |
| 404 | an unknown id, or a caller with no standing on the dataset, collection, or group the URL names | nothing: the two causes answer identically |
| 400 | a malformed body, or a client-supplied fact that disagrees with the row | which field is wrong |
| 409 | a state guard, a stale `expected_version`, a lost race, or a conflicting in-flight request | the state that refused it; a request conflict names its `preset_ids` and `access_type_ids` |
| 200 `invalid` | `POST /auth/invite/check` for any bad token | one message for every cause |

The 403 for a caller with standing follows [Design](./design.md#foundational-invariants): a user
without access cannot know the resource exists, so a caller with no standing is answered as if
the resource did not exist. A caller who can read a resource already knows it exists, so a 403
on a mutation reveals nothing.

The 409 body of an in-flight request conflict is a contract the UI reads, and it keeps its shape.

## Non-edges

Four relations look like access edges and are not.

| Relation | An access edge? | Pinned by |
|---|---|---|
| Dataset lineage | No | `derivedIndependence.test.js` |
| Attribution | No | `dataset.attribution.test.js` |
| Use conditions | No | `dataset.use-conditions.test.js` |
| Collection membership after removal | No, history only | `collections.lifecycle.test.js` |

## Accepting standing never raises it

An operation that applies standing a subject was offered may grant what it names, and never
raises standing the subject already holds.

- An invitation as `ADMIN` accepted by a current `MEMBER` leaves them a `MEMBER`.
- A preset never shortens an existing grant's expiry.
- Promote and demote each move a role in one direction.

## Where the values come from

A group name, a collection name, a tagline, and an about text are chosen by one user and
rendered to others. Invitation emails, audit `target_name`, notification titles, and every
listing render them. Handlebars escapes them in email, and Vue escapes them in the UI, which
renders no user-chosen field through `v-html` except the sanitised about text.

## Invariant ownership

| Invariant | Held by |
|---|---|
| One live grant per subject, resource, type, and window | the `grant_no_overlap` exclusion constraint |
| One pending invitation per group and address | a partial unique index |
| A `resource` row never outlives its dataset | a database trigger |
| A grant blocks a hard delete | `ON DELETE RESTRICT` |
| One update per version | optimistic `expected_version`, 409 on a stale write |
| `is_archived` agrees with the restriction table | one transaction, and `restrictions.test.js` |
| A service change to a restricted group or collection is refused | `isRestricted` on `effective_restriction`, inside the transaction that holds the row lock, and `serviceGuards.test.js` |
| A collection with history is never deleted | `deleteCollection`, under the collection row lock, and the `delete` transition row |
| A group that has an admin keeps one | `assertAdminsRemain`, inside the removal or demotion transaction, under the group row lock |
| A collection's datasets share its owning group | `addDatasets`, and the absence of any route that changes a dataset's owner |
| Access-request status moves only along the transition table | a `WHERE status = ...` guard on each write |
| No duplicate in-flight request | application code, read then write |

## The transition table

A stateful resource admits an action only in the states listed. The capability map consults
this table, so a capability is never offered in a state that would refuse it.

### Access requests

| Action | From | To |
|---|---|---|
| `create` | none | `DRAFT` |
| `update` | `DRAFT` | `DRAFT` |
| `submit` | `DRAFT` | `UNDER_REVIEW` |
| `withdraw` | `DRAFT`, `UNDER_REVIEW` | `WITHDRAWN` |
| `review` | `UNDER_REVIEW` | `APPROVED`, `PARTIALLY_APPROVED`, or `REJECTED` |
| expiry, run by the system | `UNDER_REVIEW` | `EXPIRED` |
| `read` | every state | unchanged |

### Invitations

| Action | From | To |
|---|---|---|
| `group.invite` | none | `PENDING` |
| cancel, bound to `group.invite` | `PENDING` | `CANCELLED` |
| accept, by token | `PENDING`, unexpired, group not archived | `ACCEPTED` |

### Grants

| Action | From | To |
|---|---|---|
| `create` | none | active |
| `revoke` | not revoked | revoked, `MANUAL` |
| supersession, run by the system | active | revoked, `SUPERSEDED` |
| expiry, by time | active | expired; no row changes |

## Time

The current time is an input to every derived relation. Tests control time by writing rows whose
intervals already lie in the past or the future. Every read recomputes `active` from `now`.

Two decisions outlive the request that made them.

- **A download token** is minted from an external OAuth server for one path. Its lifetime is set there, and revoking a grant revokes no issued token. That lifetime is the accepted exposure window.
- **A public profile** is cached for up to 300 seconds after its visibility changes.

## The UI consumption contract

The UI is never the gate. The API refuses on its own, and a page's job is to offer the controls
the decision allows and show the fields the projection returned.

A v2 page may gate on a capability the API sent, on standing the API sent, and on a display-only
fact. It does not re-derive restriction, identity, state, grant activity, implication, or
whether a caller may request access.

| Response shape | Producer | Read by | Pinned by |
|---|---|---|---|
| `_meta.capabilities` on a detail route | the engine, filtered by restriction and transition | every `[id]` page through `can()` | the capabilities arm |
| `request_access` in a detail route's capabilities | `mayRequestAccess`: signed in, and no restriction blocks `access_request.create` | the dataset and collection Overview tabs | the list rows arm, through the restriction batch |
| `_meta.standing` on a detail route | the path rows | the badge and `MyAccessTab` | `tests/model/standingArm.test.js`, `tests/model/badgeCoverage.test.js` |
| `_meta.capabilities` and `_meta.standing` on a list row | `decideRows`, the detail route's composition for each row | list pages, cards, and the request cards | `tests/model/listRowsArm.test.js` |
| the fields of a list row or a related row | `projectRows`, each row's own read decision | list pages, lineage, and the group tree | `tests/model/relatedRowsArm.test.js`, `tests/services/grants/relatedLineage.test.js` |
| `is_active` on a grant row | `isGrantActive`, the predicate of `valid_grants` | the grant panels | `tests/services/grants/isActive.test.js` |
| the revoke preview | `previewRevoke`, from coverage over every path | `RevokeGrantModal` | `tests/services/grants/revokePreview.test.js` |
| list `scope` | `RESOURCE_SCOPES` and the group scopes | the scope filters | the list arm |
| `/v2/users/me` facts | `user_role` and the membership views | the dashboard, the groups list, and the subject selector | `tests/services/groups/governanceCounts.test.js` |
| refusal status and the 409 body | `createDecisionPipeline`: 404 without standing, 403 with it | `ErrorState` and the request form | `tests/routes/groups.invitations.test.js`, `tests/routes/access_requests.create.test.js` |
| the actions a restriction type blocks | `blockedActions`, from each action's restriction class | the archive dialogs, through `restrictionLabels.js` | `tests/model/restrictionLabels.test.js` |
| a user directory search | `searchDirectory`: three characters, ten people, four fields | `UserSearchSelect` | `tests/routes/users_v2.directory.test.js` |
| eligible owner groups | `dataset.contribute` decided on each candidate the path statement names | the dataset create dialog | `tests/services/datasets/dataset.eligible-owner-groups.test.js` |
| a field present only for some paths | the attribute rules | `GroupOverviewTab` for `allow_user_contributions` | the projection arm |

## Decision surfaces outside the engine

- **Import** decides from `import_source`, membership, and `contributions_allowed` in `resolveImportSourceForUser`. It has no action name.
- **Downloads** decide once in the engine, then trust the minted token.
- **Uploads** carry the session bearer to the TUS server, which checks the dataset's `contribute` decision when the upload is registered.

## Extension

Every table and every check is stated over the registries. A container a derived app registers in
`custom/` carries its own action rows, restriction classes, attribute rules, and transition rows,
and the completeness checks iterate the registry rather than a literal list.

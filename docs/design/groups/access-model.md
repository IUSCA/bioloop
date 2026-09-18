# Access model

The rule that decides every access question in v2, stated over the data it reads. Every
consumer, from the policy engine to a button on a page, gives the answer this page gives.

[How the model is checked](#how-the-model-is-checked) describes the tests that compare the code
with this page. Decisions are recorded in [Decisions](./decisions.md), and the lifecycle effects
are in [Design — Lifecycle Management](./design.md#lifecycle-management).

## Terms

- A **state** is the contents of the access tables at one instant, together with the current time.
- An **operation** changes a state. Adding a member, issuing a grant, and archiving a group are operations.
- A **decision** answers one question: may user `u` take action `a` on resource `r` in state `S`?
- A **consumer** is any code that answers some version of that question. The engine, a list query, a capability map, a badge, and a `v-if` that offers a button are all consumers.
- A **path** is one reason a decision is true.
- A caller's **standing** on a resource is the set of paths for that resource's read action.

## What correct means

The system is correct when five properties hold.

1. **Specification.** One rule gives the decision for every state, user, action, and resource. No combination lacks an answer.
2. **Agreement.** Every consumer gives the answer the rule gives. A list contains a resource exactly when its page opens.
3. **Invariants.** Every operation leaves the state satisfying the invariants in [Invariant ownership](#invariant-ownership).
4. **Coverage.** The test data contains every enum value, every registered action, and every operation, so an unhandled new value fails a test.
5. **Extension.** Every rule, table, and check is stated over the registries, as [Extension](#extension) describes.

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
| Restriction | whether a restriction blocks it | the restriction check every action passes, which allows every action until restriction types are specified |
| Projection | which fields the caller sees | the attribute rules inside `.attributes({...})` |
| Disclosure | what a refusal reveals | the refusal shapes below |

A consumer that returns the right boolean and the wrong field set disagrees with the model.

Resource state is not a plane of the decision. The service that performs an action checks it after
authorization, as [The state check](#the-state-check) describes.

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
| `restriction(r, type, interval)` | a restriction on resource `r`; no type is specified yet | none |
| `deleted(d)` | dataset `d` is deleted, which cannot be undone | `dataset.is_deleted` |
| `archived(x)` | group or collection `x` is archived | `group.is_archived`, `collection.is_archived` |
| `system_principal(g)` | `g` is Public or Authenticated Users | seeded ids |
| `quarantine(g)` | `g` is the seeded `Unassigned Datasets` group, which its seed archives | seeded id |
| `seeded_grant(g, r)` | the owning-group grant written when `r` was created | `grant.creation_type = SYSTEM_BOOTSTRAP` |
| `profile_visibility(x)` | who may read the profile of a group or a collection | `profile_visibility` column |
| `contributions_allowed(g)` | members of `g` may register datasets it owns | `group.allow_user_contributions` |
| `status(x)` | the lifecycle state of an access request, an invitation, or a grant | `access_request.status`, `group_invitation.status`, `grant.revoked_at` |
| `import_source(g, path, status)` | group `g` may register datasets under `path` | `import_source` |

Containment between the two system principals runs one way. A signed-in caller holds both Public
and Authenticated Users, because Public is the wider audience. An anonymous caller holds only
Public, so a grant to Authenticated Users never reaches them. `subjectSetSql` in
`api/src/services/grants/helpers.js` is the one place that builds a caller's subject set.

Ten access types exist. Their order is a forest.

- `DATASET:DOWNLOAD`, `DATASET:COMPUTE`, and `DATASET:REMOTE_ACCESS` each imply `DATASET:LIST_FILES`.
- `DATASET:LIST_FILES`, `DATASET:VIEW_SENSITIVE_METADATA`, `DATASET:LIST_SOURCE_DATASETS`, and `DATASET:LIST_DERIVED_DATASETS` each imply `DATASET:VIEW_METADATA`.
- `COLLECTION:LIST_CONTENTS` implies `COLLECTION:VIEW_METADATA`.

`DATASET:REMOTE_ACCESS` is checked by its own action, `dataset.remote_access`, so a grant of it
names more than file listing. No route binds that action yet.

## Derived relations

Each derived relation has one definition, and every consumer reads that definition.

- **`active(x, now)`** holds when `x` is not removed or revoked, its start is not after `now`, and its end is null or after `now`. The views `active_group_user`, `valid_grants`, and `active_collection_dataset` are this predicate.
- **`effective_member(u, g)`** holds when `u` has an active membership in `g` or in any descendant of `g`. Membership flows upward.
- **`admin(u, g)`** holds when `u` has an active `ADMIN` membership in `g` itself. Authority does not flow.
- **`oversees(u, g)`** holds when `u` is admin of a strict ancestor of `g`.
- **`has_admin(g)`** holds when some account that is not deleted has an active `ADMIN` membership in `g`. It is the one definition the last-admin rule and the no-active-admins report both read.
- **`subjects(u)`** holds `u`, every group `u` is an effective member of, Authenticated Users when `u` is signed in, and Public.
- **`holds(u, r, t)`** holds when some active grant has its subject in `subjects(u)`, names `r` or a collection that actively contains `r`, and carries a type that implies `t` through the closure.
- **`restricted(u, r, a)`** holds when a restriction on `r` blocks the restriction class of `a` for `u`. Every action declares one of three classes: `mutating`, `reading`, or `data`, which reads a dataset's bytes. No restriction type is specified, so `restricted` never holds today.
- **`open(r)`** holds when a dataset is not deleted and its owning group is not archived, or when neither a collection nor its owning group is archived.
- **`for_archived_group(x)`** holds when the access request or grant `x` is for a group, and that group is archived. A request or a grant for a user never is.
- **`precondition(a, x)`** holds when the status of an access request, an invitation, or a grant admits `a`, according to the transition table below.
- **`state_admits(a, r)`** holds when the state of `r` admits `a`.
  - For a group, a collection, or a dataset, it follows the action's restriction class. A `mutating` action needs neither `r` nor its owning group archived. A deleted dataset also refuses every `data` action. A `reading` action is always admitted.
  - Four actions have their own rule. `archive` needs `r` not archived, and a collection's owning group not archived. `unarchive` needs `r` archived. A create reads only the owning group it names.
  - For an access request, an invitation, or a grant, it is `precondition(a, r)`, together with `open` on the resource or group the row names, and for a request or an issue `not for_archived_group(r)`, as the transition table lists.
- **`resource_rule(a, r)`** holds when a term that reads only columns of `r` admits `a`. Today that is `view_profile` when the profile is `PUBLIC`, or `AUTHENTICATED` for a signed-in caller.

## The rule is a query

The rule is evaluated in SQL, because a list has to filter before `LIMIT`, `OFFSET`, and `COUNT`.
A filter applied after the database chose a page gets both the page and the total wrong. Policies
stay JavaScript, because a derived app extends them.

`accessPathsQuery` in `api/src/authorization/builtin/paths/index.js` returns one row per path,
naming the resource, the path kind, and what the path runs through. Lists, single checks,
standing, and capabilities all read it.

Three inputs stay outside the statement. The platform-admin check runs once before it. Attribute
filters project the row afterwards. Terms that name no resource, such as `isRequester`, stay
hydrated policies. A list adds the restriction check as `restrictionPredicate` in
`accessibleIdsQuery`.

## What each search scope shows

`POST /groups/search` takes a `scope`, and every group picker in the UI is one. The scopes split
into two families, and the split is what makes the platform-admin column predictable.

The first family asks what standing the caller holds. These read the caller's own membership
rows, and the rule is the same for everybody.

| Scope | Ordinary user | Platform admin |
| --- | --- | --- |
| `member_of` | groups where they hold a membership row | the same — their own rows, often none |
| `administered` | groups where they hold an **admin** row | the same — their own admin rows, often none |
| `overseen` | groups strictly below one they administer | the same — usually empty |

The second family asks what the caller may reach. The platform-admin short-circuit applies, so all
three become every group.

| Scope | Ordinary user | Platform admin |
| --- | --- | --- |
| `visible` | any access path: an admin row, oversight, effective membership including ancestors, or a grant on a dataset the group owns | **every group** |
| `can_administer` | the same list as `administered` | **every group** |
| `discoverable` | `visible`, plus groups with a published profile, plus an exact id or slug | **every group** |

The system principals are excluded from every scope. They are grant subjects rather than groups
anybody joins, and the grant form offers them as their own controls.

`searchAllGroups` serves a platform admin and `searchGroupsForUser` serves everybody else, which
is why the second family adds no clause at all in the first function.

**Where each scope is used.**

| Surface | Scope | Why |
| --- | --- | --- |
| Groups listing tabs | `member_of`, `administered`, `overseen`, `visible` | the four tabs, in order |
| Access-request subject picker | `can_administer` | requesting for a group is representing it |
| Collection create, owning group | `can_administer` | `collection.create` is admin of the owning group |
| Group create, parent | `visible` | only a platform admin reaches that form, so: every group |
| Grant Access, group | `discoverable` | any group may hold a grant, so this is not about the grantor |

**`discoverable` is the only scope that widens what a caller can enumerate.** A group whose
profile is `PUBLIC` or `AUTHENTICATED` has opted into being found, and that is what makes it
offerable to somebody who wants to share with it. A group that publishes nothing is reached only
by its exact id or slug — matched exactly rather than as a pattern, so the lookup answers about
the one identifier the caller already holds and cannot be walked a character at a time.

## The decision rule

```text
allowed(u, a, r) =
  not restricted(u, r, a)
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

The restriction check runs before the platform-admin check, so a restriction binds a platform
admin too.

## The state check

An allowed action runs only when the resource's state admits it:

```text
performed(u, a, r) = allowed(u, a, r) and state_admits(a, r)
```

The authorization layer answers `allowed`. The service that performs the action checks
`state_admits` after it, inside its transaction and under the row lock, and refuses with 409. A
platform admin is refused the same way.

Archiving covers the group or collection itself and the resources it owns. A sub-group keeps its
own state. A dataset in an archived collection keeps its own state too, because a collection
contains datasets and does not own them. A create action has no resource yet, so its state check
reads the owning group it names.

Archiving freezes what it covers. No step of an access request moves while its resource is not
open or while it is for an archived group, withdrawing included, and nothing is cancelled. No
grant is issued to an archived group. A grant the group already holds on another group's resource
can still be revoked, because that resource's group is not frozen. The expiry job still closes a
request under review, because it runs on time rather than on a person's action.

The rules live in `api/src/state/builtin/`, one container per resource type. Invitations have a
container of their own, although they have no policy container. A service calls
`state.assertPossible` with the row it locked. A rule is a pure function of that row, and it
declares the fields it reads. The caller fetches them, so the layer runs no query. A rule whose
field the caller did not fetch throws an error naming the field. A response reports the same
rules as `_meta.available_actions`, through `state.availableActions`. The server refuses to start
when a policy action has no state rule.

@see [decision 17](./decisions.md#_17-resource-state-is-checked-after-authorization)

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
standing panel lists every path. A list row's badge, from `rowBadgeFor`, leaves out
`platform_admin`, because it would repeat on every row. The detail badge keeps it.

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

A path copies only what the source holds. A path that reaches `null` writes `null` there, so a
grant with no preset projects `source_preset` as `null`, not `{}`. A path that meets a value of
another shape writes nothing: a dot never walks into an array, a `Date`, or a primitive, and `[*]`
applies only to an array. Only own keys match, so `toString` is never a path.

A caller who holds several paths sees the union of what each path confers. The union is over
projected key sets, not over pattern lists, because concatenating a list with a negation onto a
permissive list removes keys the permissive rule granted.

```text
fields(u, a, r) = ⋃ { keys(project(r, filters(a, k))) : k ∈ path_kinds(u, r) }
```

A filter is valid only for the resource whose decision produced it. A list is therefore projected
by the caller's `list` decision on the type, not by a decision on any row. Its query decides which
rows appear. The `list` action's attribute rule gives the public attributes, and a platform admin
sees every field. A row shows more only on its detail route. A search route binds
`authorize(type, 'list')` and uses `req.permission.filter`. Lineage, ancestors, and descendants
are decided on the resource in the URL, so they use `import(type).listFilter()` instead. A grant list
shows the grant attributes, because its query returns only grants the caller holds or governs.

`*` is never used where a row embeds another user's record. A grant row names the fields it may
carry of its subject, grantor, and revoker.

## Refusal shapes

A refusal's shape is a function of what the caller is entitled to know, never of the reason it
failed. The reason goes to the log.

| Status | When | What the caller learns |
|---|---|---|
| 401 | no session, or an expired one | nothing about any resource |
| 403 | a signed-in caller who holds standing on the resource, refused an action; or any refusal by a container other than dataset, collection, or group | the action is refused |
| 404 | an unknown id, or a caller with no standing on the dataset, collection, or group the URL names | nothing: the two causes answer identically |
| 400 | a malformed body, or a client-supplied fact that disagrees with the row | which field is wrong |
| 409 | a state check, a stale `expected_version`, a lost race, or a conflicting in-flight request | the state that refused it; a request conflict names its `preset_ids` and `access_type_ids` |
| 200 `invalid` | `POST /auth/invite/check` for any bad token | one message for every cause |

The 403 for a caller with standing follows [Design](./design.md#foundational-invariants): a user
without access cannot know the resource exists, so a caller with no standing is answered as if
the resource did not exist. A caller who can read a resource already knows it exists, so a 403
on a mutation reveals nothing.

The 409 body of an in-flight request conflict is a contract the UI reads, and it keeps its shape.

A check called without the information it needs throws rather than widening. `userHasGrant` with
no access types is one such check.

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
| An action the resource's state does not admit is refused | the state check, inside the transaction that holds the row lock |
| A collection is never deleted | no route, service, policy action, or state rule deletes one; `tests/services/collections/archiveOnly.test.js` asserts the absence |
| A group that has an admin keeps one | `assertAdminsRemain`, inside the removal or demotion transaction, under the group row lock |
| A collection's datasets share its owning group | `addDatasets`, and the absence of any route that changes a dataset's owner |
| Access-request status moves only along the transition table | the access-request state rules, and a `WHERE status = ...` guard on each write for the request that loses a race |
| No duplicate in-flight request | application code, read then write |

## The transition table

A stateful resource admits an action only in the states listed. The state rules in
`api/src/state/builtin/` enforce this table. A group, a collection, and a dataset have no status,
and `state_admits` above states what their archived and deleted states admit. **Open** in the
tables means `open` holds for the resource the row names. **Frozen** means the row is not open,
or `for_archived_group` holds.

### Access requests

| Action | From | To |
|---|---|---|
| `create` | none, not frozen | `DRAFT` |
| `update` | `DRAFT`, not frozen | `DRAFT` |
| `submit` | `DRAFT`, not frozen | `UNDER_REVIEW` |
| `withdraw` | `DRAFT` or `UNDER_REVIEW`, not frozen | `WITHDRAWN` |
| `review` | `UNDER_REVIEW`, not frozen | `APPROVED`, `PARTIALLY_APPROVED`, or `REJECTED` |
| expiry, run by the system | `UNDER_REVIEW` | `EXPIRED` |
| `read` | every state | unchanged |

### Invitations

| Action | From | To |
|---|---|---|
| `group.invite` | none | `PENDING` |
| cancel, bound to `group.invite` | `PENDING`, group not archived | `CANCELLED` |
| accept, by token | `PENDING`, unexpired, group not archived | `ACCEPTED` |

### Grants

| Action | From | To |
|---|---|---|
| `create` | none, not frozen | active |
| `revoke` | not revoked, resource open | revoked, `MANUAL` |
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

A page shows a control when its action is in `_meta.capabilities`, and enables it when the action
is also in `_meta.available_actions`. A control whose state cannot return, such as Review on a
decided request or Revoke on a revoked grant, is hidden instead of disabled.

| Response shape | Producer | Read by | Pinned by |
|---|---|---|---|
| `_meta.capabilities` on a detail route | the engine: what the caller could do, less what a restriction blocks | every `[id]` page through `can()` | `tests/model/engineArm.test.js` for the decision each capability reports, and `tests/model/transitionsArm.test.js` for access requests; no test compares a route's list with the reference model |
| `_meta.available_actions` on a detail route, and on a row of the access-request, grant, and invitation lists | `state.availableActions`, from each resource type's state rules | the pages that enable a control they show; a search list row does not carry it | `tests/state/rules.test.js`, `tests/model/stateArm.test.js`, `tests/routes/stateRefusals.test.js` |
| `request_access` in a detail route's capabilities | `mayFileRequest` in `services/access_requests`: signed in, no restriction blocks `access_request.create`, and the resource's state admits a request | the dataset and collection Overview tabs | `tests/services/access-requests/mayFileRequest.test.js` |
| `_meta.standing` on a detail route | the path rows | the badge and `MyAccessTab` | `tests/model/standingArm.test.js`, `tests/model/badgeCoverage.test.js` |
| `_meta.capabilities` and `_meta.standing` on a list row | `decideRows`, the detail route's composition for each row | list pages, cards, and the request cards | `tests/model/listRowsArm.test.js` |
| the fields of a list row or a related row | the `list` decision's filter: the public attributes, or every field for a platform admin | list pages, lineage, and the group tree | `tests/authorization/listFilter.test.js` |
| `_meta.standing` on a group search row | `standingOfRows`, the path rows from one statement for the page | the group cards and the dashboard badges | `tests/authorization/listFilter.test.js` |
| `is_active` on a grant row | `isGrantActive`, the predicate of `valid_grants` | the grant panels | `tests/services/grants/isActive.test.js` |
| the revoke preview | `previewRevoke`, from coverage over every path | `RevokeGrantModal` | `tests/services/grants/revokePreview.test.js` |
| list `scope` | `RESOURCE_SCOPES` and `SEARCH_SCOPES` | the scope filters | `tests/model/listsArm.test.js`, for the `visible` scope; `tests/services/groups/groups.search-scopes.test.js` for the other five |
| `/v2/users/me` facts | `user_role` and the membership views | the dashboard, the groups list, and the subject selector | `tests/services/groups/governanceCounts.test.js` |
| refusal status and the 409 body | `createDecisionPipeline`: 404 without standing, 403 with it | `ErrorState` and the request form | `tests/routes/groups.invitations.test.js`, `tests/routes/access_requests.create.test.js` |
| the actions archiving forbids | each resource type's own state rules, through `GET /v2/states/:type/archived/forbidden-actions` | the archive dialogs, through `stateLabels.js` | `tests/model/stateLabels.test.js` |
| a user directory search | `searchDirectory`: three characters, ten people, four fields | `UserSearchSelect` | `tests/routes/users_v2.directory.test.js` |
| eligible owner groups | `dataset.contribute` decided on each candidate the path statement names; `listOwnerGroupCandidates` leaves out archived groups, as a state fact | the dataset create dialog | `tests/services/datasets/dataset.eligible-owner-groups.test.js` |
| a field present only for some paths | the attribute rules | `GroupOverviewTab` for `allow_user_contributions` | no test |

## Decision surfaces outside the engine

- **Import** decides from `import_source`, membership, and `contributions_allowed` in `resolveImportSourceForUser`. It has no action name.
- **Downloads** decide once in the engine, then trust the minted token.
- **Uploads** carry the session bearer to the TUS server, which checks the dataset's `contribute` decision when the upload is registered.

## How the model is checked

The harness lives in `api/tests/model/`. It compares consumers with a reference model over
generated worlds, and it drives random operation sequences.

**The reference model.** `reference.js` states the decision rule in plain JavaScript over
in-memory arrays. It never imports the engine, the services, or Prisma. It reads the same three
tables the engine reads. The reference was written from the design, and the design was read from
the code, so both can share a mistake. The decision records and the cases manual testing found
are the check on that. `modelCoverage.test.js` fails on a registered type that is neither modelled
nor named in `NOT_MODELLED`.

**Worlds.** A world is a set of groups, users, resources, and grants. `worlds.js` generates it,
and `dbWorld.js` writes it to the database. A cell is one user and one dataset, over twelve
dimensions: caller, relation to the owning group, grant subject, grant route, access type, grant
validity, archived, deleted, owner, seeded grant, profile visibility, and contributions. The
database arms run on a covering set in which every pair of values appears at least once. They add
sensitivity pairs: for each dimension, two cells that differ only there and that the reference
decides differently. The generator fails a dimension with no such pair. The reference also writes
[the decision table](./generated/access-decisions.md), and `npm run model:table -- --check` fails
when that file is stale.

**Comparison arms.** Each arm compares one consumer with the reference for every user, action,
and resource in a world. `engineArm` covers `authorizeAction` with the creates, and `pathsArm`
covers `accessPathsQuery`. `listsArm`, `listRowsArm`, and `standingArm` cover the lists, each
row's `_meta`, and `_meta.standing`. `transitionsArm` covers access-request capabilities in every
status, and `stateArm` covers `state.checkOf`. No arm compares a route's capabilities, projected
fields, refusal status, or session handling with the reference. `refusalStatus.test.js` and
`attributeRuleOrdering.test.js` cover part of that by example.

**Operation sequences.** `operationSequences.test.js` drives `fast-check` command sequences
against the real services and the reference, and compares the two after every command.

## Extension

Every table and every check is stated over the registries. A derived app registers two containers
for a new resource type. The policy container in `api/src/authorization/custom/` carries its
actions, their restriction classes, and its attribute rules. The state container in
`api/src/state/custom/` carries a state rule for every one of those actions. The completeness
checks iterate the registries rather than a literal list, and the server refuses to start while the
two disagree.

`api/src/authorization/builtin/tables/index.js` builds the term, action, and attribute tables from
the registered containers. They live in code and change as reviewed diffs. Only relations the SQL
joins are database tables, and `prisma/seed_baseline.js` writes their constants from
`api/src/constants.js`. The harness cannot catch a wrong table row, because the reference reads
the same tables. Review and the generated decision table check the rows.

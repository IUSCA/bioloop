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
- A **consumer** is any code that answers some version of that question. The policy engine is one consumer. List queries, capability lists, role badges, the UI persona, service guards, and the import path are others.

The system is correct when five properties hold.

1. **Specification.** One written rule gives the decision for every state, user, action, and resource. The rule is total, so no combination lacks an answer.
2. **Agreement.** Every consumer gives the answer the rule gives. A list contains a resource exactly when its page opens. A badge names the path the decision took.
3. **Invariants.** Every operation leaves the state satisfying the stated invariants. For example, no open access request names a resource that no longer exists.
4. **Coverage.** The test data contains every enum value, every registered action, and every operation. A test fails when a new value arrives unhandled.
5. **Extension.** Every rule, table, and check is stated over the registries rather than over a literal list, so a derived app that adds a resource type inherits all of them.

The mismatch between grants and roles is a failure of property 2. Access comes from grants and
from group structure. The UI shows one role word, and a separate first-match rule computes
that word. The word can therefore disagree with what the caller can actually do.

Property 5 is new in this revision. The engine is a three-layer framework: `core/` is never
edited downstream, `builtin/` holds this application's policies, and `custom/` is the empty
extension point. An earlier draft modelled only `builtin/`. That would have produced a
specification a derived app could not use, and coverage checks it could not inherit.

## The model

### A decision is a tuple, not a boolean

This is the largest correction to the earlier draft. The engine does not return "allowed". It
returns a decision together with a field filter, and the route turns a refusal into one of
three different shapes. Modelling only the boolean left most of the existing behaviour outside
the specification.

```text
decide(u, a, r, S) = {
  allowed : Bool,
  paths   : Set<Path>,       -- every reason allowed is true
  fields  : Set<Attribute>,  -- what u may see of r
  refusal : Shape            -- what u learns when allowed is false
}
```

Four planes, each already implemented somewhere, and only the first modelled before.

| Plane | Question | Where it lives today |
|---|---|---|
| Authority | who may act | the terms inside `.actions({...})` |
| Restriction | whether the state blocks it | `MUTATING_ACTIONS`, `READING_ACTIONS`, and `effective_restriction` |
| Projection | which fields the caller sees | the first-match rules inside `.attributes({...})` |
| Disclosure | what a refusal reveals | `hideRefusals`, the uniform invite `invalid`, the import messages |

Specification and Agreement now range over the whole tuple. A consumer that returns the right
boolean and the wrong field set disagrees.

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
| `import_source(g, path, status)` | group `g` may register datasets under `path` | `import_source` |

`import_source` is new to the model. Import is a fourth decision surface that the policy engine
never sees. `resolveImportSourceForUser` answers "may this user register a dataset from this
path" from group membership alone, with no action name, no policy, and no attribute rule. A
model that omits it cannot claim totality.

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

This page writes the rule as a formula. In the code it lives next to the data, as one SQL
statement that both lists and single checks run. [The rule is a query](#the-rule-is-a-query)
describes that shape.

### Three tables, all data

The earlier draft proposed one action table. Three are needed, because the engine already
distinguishes three things a single table would flatten.

**The term table.** One row per policy term: its name, the container it belongs to, the facts
it declares in `requires`, and optionally its SQL fragment. Term names are local to a
container, so a name alone is not a key. `isAdminOfResourceGroup` means different reads in
`grant.js` and in `access_request.js`. Two terms already break the table's premise and must be
fixed before it can be trusted: the resource-group terms in `grant.js` declare only
`['resource_id', 'resource_type']` and then fetch through services inside an async `evaluate`,
so `requires` under-declares what they read.

**The action table.** One row per registered action, with four columns: resource type, accepted
path kinds, required access type, and restriction class. The table needs 73 rows. The count was
taken on 2026-09-14 by calling `policyRegistry.get(type).getActionNames()` for every registered
container, and comes to 23 dataset, 21 group, 16 collection, 7 grant, 4 access request, 1 user,
and 1 audit.

The restriction-class column is the important addition, because it explains the count.
`tests/routes/groups.invitations.test.js` states the rule outright:

> Two actions, invite and view_invitations, and both are `isGroupAdmin`. They are split because
> ARCHIVED treats them differently, not because a different person holds them.

The same file confirms it a second time, in the test that an archived group's outstanding
invitations stay readable: "The reason view_invitations is its own action."

So the 73 actions are not 73 authorities. They are the product of two independent
classifications that today are encoded in one name. Once an action declares its restriction
class as data, the hand-written `MUTATING_ACTIONS` and `READING_ACTIONS` sets — 36 entries each,
72 in total — disappear, and with them the gap in the completeness check described under
Findings.

**The attribute table.** One row per pair of action and path kind, giving the **path list** that
pair confers — patterns, not field names, in the form the next section describes. This replaces
the ordered first-match rule lists.

### Projection: a path list, not a field set

An `attribute_filters` entry is not a field name. It is a path pattern, and the list is applied
to the fetched object by `projectObject` in `src/utils/expression`. Four capabilities matter to
the model.

| Form | Example | Meaning |
|---|---|---|
| Nested path | `owner_group.name`, `metadata.type` | one key, reached by walking |
| Array wildcard | `items[*].id`, `roles[*].permissions[*].name` | that key in every element |
| Wildcard | `*` | a **shallow** copy of the source |
| Negation | `!assignor`, `!items[*].x` | removed after every positive path |

Two consequences follow from the implementation and are easy to miss. `*` is a shallow spread,
so it does not reach into relations, which is why `base_attributes.grant` is `['*']` *plus*
explicit `resource.dataset.…` and `subject.group.…` paths. And negations are applied last
regardless of where they sit in the list: the module documents it, a property test pins it, and
`testing.md` states the intent as "The projector is a set operation, not a sequential one".

**Combining two rules is therefore not list concatenation.** Positive paths do union —
`applyPath` writes each one into a fresh result, and a property test asserts that `'*'` mixed
with other paths still returns the whole object. Negations do not union. Measured against the
real module on 2026-09-15, using the one negation rule that exists today
(`group.js:232`, `['*', '!assignor', '!assigned_by']`):

| Filters | Result |
|---|---|
| `['*', '!assignor']` | `{a, b}` |
| `['*']` | `{a, assignor, b}` |
| the two concatenated, either order | `{a, b}` |
| the key-set union of the two results | `{a, assignor, b}` |

So a caller who matches two rules would see strictly *less* than a caller who matches only the
permissive one. The model therefore defines the combination over projected key sets rather than
over pattern lists:

```text
fields(u, a, r) = ⋃ { keys(project(r, filters(k))) : k ∈ path_kinds(u, r) }
```

Equivalently: a negation in one rule may suppress a key only when no other matching rule grants
that key positively.

This also changes what the agreement check can be. Two filter lists cannot be compared as
patterns, because the key set a list produces depends on the object it is applied to: `['*']`
and `['id', 'name']` are orderable only against a given row. So the check that today's
first-match ordering is safe — that each earlier rule's result is a superset of every later
one's — has to run against a representative seeded row per resource type, in CI, rather than at
boot from the patterns alone.

The ordering matters because one container is not safe. In `group.js` each earlier rule's
result is a superset of the later ones. In `dataset.js` it is not: the oversight rule sits above
the sensitive-grant rule, so an overseer who also holds `DATASET:VIEW_SENSITIVE_METADATA` sees
the overseer's fields and loses `staged_path`. `grantHolderAttributes.test.js` names the hazard
in its header and tests grant holders alone, so nothing asserts the mixed case today.

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

Paths and the projection union are one fix applied twice. First-match discards information in
the role derivation and in the field derivation, and both discards are visible to users.

### Refusal shape

Three refusal shapes exist in the code, and each was chosen deliberately.

| Shape | Where | Reason given in the code |
|---|---|---|
| 403 | signed-in detail routes | the caller may know the resource exists |
| 404 | the `/public` router, via `hideRefusals` | a 403 confirms existence to an anonymous caller |
| 200 with `{ status: 'invalid' }` | `POST /auth/invite/check` | "a reason would tell an unauthenticated caller the state of somebody else's invitation" |

The invite route is the most complete statement of the idea. Four different causes — an unknown
token, an expired one, a cancelled one, and an archived group — all answer with the same body.

The model states the rule once. **A refusal's shape is a function of what the caller is
entitled to know, never of the reason it failed.** The reason goes to the log. Two further
instances follow the same rule without naming it: the import path refuses a duplicate directory
without naming the dataset or the group that holds it, and invitation creation returns
identical bodies whether or not the address has an account.

### Non-edges

A model of this system must state what is *not* an authorization input as explicitly as what
is. Four relations look like access edges and deliberately are not. Each is already pinned by a
test, and a reader of the code alone cannot tell.

| Relation | An access edge? | Pinned by |
|---|---|---|
| Dataset lineage | No | `derivedIndependence.test.js` — "lineage is recorded but is not an authorization edge" |
| Attribution | No | `dataset.attribution.test.js` — `describe('attribution is not governance')` |
| Use conditions | No | `dataset.use-conditions.test.js` — `describe('nothing enforces them')` |
| Collection membership after removal | No, history only | `collections.lifecycle.test.js` |

This also answers the grants-versus-roles question from the other side. The interface shows
affiliations, use conditions, and lineage beside access controls, and none of them confers
access.

### Accepting standing never raises it

An operation that applies standing a subject was offered may grant what it names, and must
never raise standing the subject already holds. `auth.invite.test.js` states the rule for one
case: someone invited as `ADMIN` who is already a `MEMBER` stays a `MEMBER`, and the invitation
closes as accepted. "An invitation is not a way to change a role."

The same shape recurs and is unstated elsewhere. A preset must not extend an existing grant's
expiry downward, which `issueGrants` handles by comparing expiries before superseding. Promote
and demote move a role in one direction each. The model names the property once so that every
accept-shaped operation is checked against it, rather than each one rediscovering it.

### Where the values come from

Some fields are chosen by one user and rendered to another, so the model records their
provenance. A group admin picks the group name and may invite any address, which makes that
name attacker-controlled input that reaches strangers. `invitation.email.test.js` is the only
place this is written down, and it defends the email template by asserting that a group name
containing markup is escaped.

The same strings also flow into audit `target_name` through `resolveEntityName`, into in-app
notification titles, and into every listing. The model carries a short provenance note — which
fields are user-chosen, where they are rendered, and what escapes them — because this is a
property of the whole system that currently lives in one test comment.

### Invariant ownership

Property 3 needs to say which layer holds each invariant, because only the ones held by
application code can be broken by a new call site or by a derived app.

| Invariant | Held by | Evidence |
|---|---|---|
| One live grant per subject, resource, type, and window | `grant_no_overlap` exclusion constraint | `grants.concurrency.test.js` |
| One pending invitation per group and address | partial unique index | `invitation.service.test.js` — "the database, not the service, is what makes two simultaneous invites one" |
| A `resource` row never outlives its dataset | database trigger | `dataset.delete.test.js` — "No application code deletes this" |
| A grant blocks a hard delete | `ON DELETE RESTRICT` | `dataset.delete.test.js` |
| One update per version | optimistic `expected_version`, 409 on a stale write | `groups.concurrency.test.js` |
| `is_archived` agrees with the restriction table | one transaction, and an assertion | `restrictions.test.js` — `describe('the denormalised is_archived column')` |
| At least one admin per group | application code, outside a transaction | filed as L1 T13 |
| Access-request status transitions | application code, one guard per method | no table lists the legal moves |
| No duplicate in-flight request | application code, read then write, no lock | — |

Three load-bearing invariants already sit in the schema. That is the strongest argument for
keeping the rule near the data, and it is why the reference model must not be the only oracle.
A JavaScript-only model of this system would misrepresent where its correctness comes from.

### Time

The current time is an input to every derived relation, and "active" has one definition.
Tests control time by writing rows whose intervals already lie in the past or the future. They
never move a clock.

This leaves one gap. No test observes a row crossing its expiry partway through a sequence.
That is acceptable, because every read recomputes `active` from `now`.

### Extension

Every table and every check is stated over the registries. A derived app that registers a
container in `custom/` gets the coverage checks without editing them.

One concrete gap blocks this today. `PolicyRegistry` is a `Map` with no iteration API, while
`HydratorRegistry` has `listTypes()`. Because of that, `restrictions.test.js` hard-codes six
resource type names, `audit.read_records` is classified by neither the mutating nor the reading
set, and a container added by a derived app would escape the check entirely. Adding
`listTypes()` to `PolicyRegistry` is a small change in `core/` that turns one enumerated test
into a total one.

The same reasoning governs the three tables. They are data the engine reads, not literals
inside it, so `custom/` adds rows rather than editing `builtin/`.

### Where the tables live, and how they change

"The table is data" is ambiguous, and the ambiguity matters: a rule in a database row is not
reviewable in a pull request, and it cannot be changed by the same edit that changes the code
depending on it. So the plan states where each table lives.

**The term, action, and attribute tables live in code**, beside the policies, as committed
constants. A term *is* code — a closure over declared facts — so it could not live in a row
anyway. The action and attribute tables are read by the JavaScript that builds the prepared
statement, not by the statement itself, so nothing about the compiled-SQL design requires them
to be rows. They are edited as files, reviewed as diffs, and versioned with the policies they
describe.

**Only relations the SQL joins are database tables.** That is the existing set: memberships,
grants, the closure, restrictions, and the access-type order.

**Where a table must reach the database, the existing pattern already answers the workflow.**
The grant vocabulary is the worked example: `GRANT_ACCESS_TYPES`,
`GRANT_ACCESS_TYPE_IMPLICATIONS`, and `GRANT_PRESETS` are constants in `src/constants.js`,
reconciled into the database by `prisma/seed_baseline.js`, and validated with no database at all
by `seed_baseline.test.js`. The database is a projection of the constants rather than the source
of truth, so authoring stays file edit, commit, review, and the seed reconciles on deploy.

That reconciliation already encodes the hard parts, and any new seeded table follows it:

- **Membership is replaced, not merged.** A preset's items are deleted when they are no longer listed, so removing an access type from a preset actually stops it being conferred.
- **A removed row is retired when anything still references it.** A preset dropped from the constants becomes `is_active: false` rather than being deleted, because grants and access-request items still name it by id.
- **A removed row is deleted only when nothing references it.** An access type dropped from the constants is deleted with its implication edges, but only after counting grants, access-request items, and preset items that name it. If any exist the seed refuses and names them, rather than leaving a type nothing lists.
- **Names are resolved to ids at seed time, and an unknown name refuses.** The implication edges are written by name in the constants and resolved against the access types, so a typo fails the seed instead of silently dropping an edge.

## What the analysis found

These findings come from reading the code on 2026-09-14 and 2026-09-15. One claim was run, and
it is marked. Every other claim was read and not run. The defects are filed in the local
backlog, under L1 T11–T13 and L2 T19–T21.

### Corrections to the previous draft of this page

Reading the tests as source reversed three conclusions in the earlier draft. They are recorded
because those conclusions were used to justify proposed work.

- **The service-level `is_archived` guards are not redundant.** The earlier draft proposed removing them. They are the second line of a deliberate three-line design, described under Target shape.
- **`effective_restriction` does reach descendants.** All four of its arms join `group_closure`. A note claiming that a child of an archived group escapes the restriction layer was wrong. What does not reach descendants is the denormalised column.
- **The `is_archived` agreement test exists.** A grep against a mistyped path suggested otherwise. It is in `restrictions.test.js`, and it compares the set of archived rows with the set of open ARCHIVED restrictions.

### Agreement: one fact with several definitions

| Fact | Definition A | Definition B | Effect |
|---|---|---|---|
| Active membership | `active_group_user`: not removed, and `valid_until` not passed | `group_user` with `removed_at: null` only, in `groupService.isGroupAdmin`, `access_requests/request.js`, and `ensureNotRemovingLastAdmin` | Latent, because nothing writes `valid_until` yet. Once expiry ships, an expired admin keeps the group-admin persona and can still file group requests. |
| Archived, for reach | `effective_restriction`, which expands through `group_closure` | the row's own `is_archived`, read at eleven guard sites across four services | The two answer differently for a descendant. See Target shape. |
| Archived, for creation | `effective_restriction`, when a target resolves | `getOwnerGroupForAuthorization`, which reads the column | A child of an archived group is offered as a dataset owner. Create actions carry no resource id, so the engine skips its restriction check. |
| Live grant | `valid_grants`: started, not expired, not revoked | `access_summary.js`: not expired and not revoked, with no start check | Latent, because every API issuance starts at the current time. |
| Caller role on a group | engine: `ADMIN`, then `OVERSIGHT`, then `MEMBER`, then `RESOURCE_ACCESS` | `searchGroupsForUser` SQL: direct role, then `OVERSIGHT`, then `TRANSITIVE_MEMBER` | A direct member of a group who also administers its parent reads `OVERSIGHT` on the page and `MEMBER` in the list. |
| Group visibility | `group.view_metadata` admits a holder of a grant on a resource the group owns | group search with scope `all` omits that term | A grant holder can open a group page that no list shows them. |
| Grants an admin may see | `grant.list_for_resource` admits admins and overseers | `listExpiringGrantsForAdmin` admits direct admins only | An overseer sees fewer expiring grants than the page lets them read. |
| Platform admin | engine: `roles.includes('admin')` | `auth.canAdmin`, from a login-time cache and case-insensitive; the persona, from `/v2/users/me`; and `isPlatformAdmin(req)`, repeated in four list handlers | Several reads of one fact. The cached copy can go stale. |
| Group admin, for the UI | persona `group_admin`, which is never set for a platform admin | `home.vue` accepts either persona; `RequestSubjectSelector.vue` checks `group_admin` only | A platform admin who also administers a group gets no "A group I administer" option. |
| Holding a grant | `getGrantAccessTypesForUser`, the context hydrator's JS form | `accessibleDatasetIdsByGrantsQuery`, the list SQL form | Two forms of one term, presumably agreeing, with no test comparing them. |

The pattern has happened before. In L1 T10, `POST /collections/search` filtered on a literal
list of access types while the page widened through the closure.
`api/tests/services/grants/listVisibility.test.js` now checks both lists against the page for
nine grant shapes. Against the old code it failed four of ten. That test is the seed of the
agreement harness below.

### The rule is written by hand in four places

This is the finding the plan exists for, and it is measurable rather than rhetorical. The
dataset access rule appears as:

1. the three terms inside `dataset.js`, evaluated one resource at a time;
2. `createAccessibleDatasetIdsCte` in `services/datasets_v2/fetch.js`, whose three `scope` branches are hand-written copies of those same three terms;
3. `viewableDatasetIds`, the per-row SQL form;
4. `explainDatasetAccess`, a fourth statement in prose and JavaScript.

Collections and groups each add their own `search*ForUser` copy. `explainDatasetAccess` has no
callers, passes its arguments in the wrong shape, skips the closure, and would let overseers
download. It should be deleted, not fixed.

### Totality: combinations with no answer

- **The restriction check allows an action whose target it cannot find.** `restrictionTargetFor` returns null for a grant or an access request when the route passes no pre-fetched resource. A null target blocks nothing. Five mutating routes pass none, so a reviewer can approve a request on an archived collection (L1 T11).
- **Create actions never reach the restriction check.** They carry no resource id. `POST /v2/datasets`, `POST /v2/datasets/bulk`, and `POST /collections` authorize with a null resource id and no service guard stands in. The paths that do check — name availability, import, and upload — all pass through `getOwnerGroupForAuthorization`, which reads the column.
- **An access check with no access types answers "any".** `userHasGrant` widens its requirement through `satisfiedBy`, which returns `[]` for a missing or empty list, and the query builders read an empty list as "no filter". No production caller reaches it, because both wrappers are dead code, but two assertions in `access-request.lifecycle.test.js` pass `access_type_id` and are therefore vacuous. The neighbouring `accessibleDatasetIdsByGrantsQuery` throws in the same situation, which is the behaviour the model requires.
- **An unknown restriction type blocks nothing.** This one is deliberate, and `typeBlocks` documents it.
- **Some roles have no badge.** `RoleBadge` has no entry for the group role `RESOURCE_ACCESS`, so it renders the raw string. The collection role `MEMBER` exists, but no rule produces it. The second group search query has no fallback role, so a row can carry a null role and show no badge.
- **The slug route throws for every caller.** `GET /groups/slug/:slug` calls `authorizeAction` with `identifiers: { group_id }` instead of `{ user, resource }`. **Run 2026-09-14** against the development database: the call throws `AuthorizationError: User identifier is required`. `/groups/:id` is registered first, so the route is also unreachable (L3 T12).

### Projection applied to rows it was not decided for

A filter is valid only for the resource whose decision produced it. Three routes break that.

- `GET /v2/datasets/:id/source-datasets` and `/derived-datasets` apply the parent dataset's rule — `['*']` for an owning-group admin — to lineage rows owned by other groups, and the services return those rows unscoped. This contradicts the decision `derivedIndependence.test.js` pins.
- `GET /groups/:id/ancestors` applies the caller's standing on this group to ancestor rows.

The same bug class is already solved once. `findDatasetRun` takes both the parent id and the
child id, and returns null unless the child belongs to that parent. Its test says why: "the
legacy routes authorize on the workflow alone and never mention the dataset". The remedy is
written, tested, and commented in this repository, and it was not applied to the other paths.

### The projector's negation path is not type-faithful

`projectObject` applies negations by deep-cloning the intermediate result with
`JSON.parse(JSON.stringify(result))`. **Run 2026-09-15** against the real module, outside the
API:

| Case | Without a negation | With a negation |
|---|---|---|
| `Date` value | stays a `Date` | becomes a `string` |
| `BigInt` value | passes through | **throws** `TypeError: Do not know how to serialize a BigInt` |
| Nested object under `'*'` | aliased to the source | deep-copied |

Three findings follow.

- **A negation rule on a dataset or collection would crash the route.** `dataset.size` and `dataset.bundle_size` are `BigInt`. Today `group.js:232` is the only rule using a negation and group members carry no `BigInt`, so this is latent rather than live. It is a trap for the next person who writes `['*', '!something']` on a resource that has one.
- **`permission.filter` is not type-faithful.** The same field is a `Date` through one rule and a `string` through another. Express serialises both the same way, so the wire format hides it, but any service-side consumer of a filtered object sees the difference.
- **`'*'` aliases the source.** A caller that mutates a projected nested object mutates the row it came from, except on the negation path, which deep-copies. The property test `'source object is not mutated by projection'` cannot catch this: it compares `JSON.stringify` immediately after projecting, and the mutation happens later through the returned reference.

Separately, `picomatch` is declared in both `api/package.json` and `ui/package.json` and
imported nowhere in either source tree. The projector is hand-written. The dependency should go.

### Authorization facts taken from the request

On the grant and access-request routes, `preFetchedResourceFn` fills the policy's resource
attributes from URL parameters or from the body. So `resource_type`, `subject_type`, and
`resource_id` are client-supplied and unverified on those routes. The model states the
invariant directly: **no authorization input is read from the request body.** It is cheap to
check with a static scan, and a rule compiled from rows removes the class entirely.

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
| Reparent a group | not built | not built | not built | the route is commented out |

### Tests are mostly examples, with a strong exception

There are 68 API test files totalling 17,882 lines, and 52 end-to-end scenarios. Nearly all are
single named examples. No test crosses roles with actions. `fast-check` is installed and used
once, outside the access layer.

The exception is a technique the codebase converged on independently in four places: a test
that asserts a mapping is total.

- `seed_baseline.test.js` — every preset is built from access types that exist and are requestable.
- `invitation.email.test.js` — "every type has a route, so none can be added and forgotten".
- `dataset.workflow-gating.test.js` — every configured workflow action exists on its container.
- `dataset.upload-status-filter.test.js` — "classifies every upload status exactly once", so "a status added to the enum cannot ship unclassified".

The one mapping it was not applied to is action-to-restriction-class, which is exactly where the
gap is. The upload-status test is the template for that fix.

Two further techniques are already accepted practice here, and the harness should reuse them
rather than invent alternatives. Tests that read source text hold architectural properties no
unit test can reach: `invitation.hook.test.js` asserts that none of the three callers of
`createUser` mentions invitations. And the failure-naming idiom
`expect([label, value]).toEqual([label, true])` makes an exhaustive check report which row
broke, instead of printing `false !== true`.

### The static checks that already exist

The engine fails at import when a policy is malformed. `new Policy({...})` validates `requires`,
`userHasGrant(type)` validates the access type name against the seeded constants, and
`PolicyContainer.freeze()` seals a container. Separately, `seed_baseline.test.js` checks the
configuration tables in CI with no database at all.

Both forms must survive. The first belongs to code and fails the process. The second belongs to
data and fails the build. The action, term, and attribute tables are data, so they get the
second.

Three checks are missing and each is cheap.

- **Hydrate every declared attribute.** Every hydrator defect recorded in the code's own comments was a request-time 500 on the first path that hydrated the attribute. A CI check that hydrates every attribute every policy declares, against one seeded row of each type, would have caught all of them before release.
- **Capabilities fail as a unit.** One action whose `requires` names an attribute no hydrator supplies throws, and the whole capability map for that page fails with it. A boot check comparing each policy's `requires` against the schema columns and the registered virtual attributes protects every detail page, not only the route that happens to use the bad action.
- **Action names chosen at request time.** `workflowService.policyActionFor(workflow_type)` maps a workflow name to a policy action while the request runs, and a missing mapping is a 400. So "every route binding names a registered action" is not wholly a boot-time fact, and the workflow map needs its own completeness test of the kind `dataset.workflow-gating.test.js` already provides.

## Target shape

### The rule is a query

The rule lives in SQL, next to the data it reads. A list needs the rule as a filter the
database can run, because the filter has to run before `LIMIT`, `OFFSET`, and `COUNT`. A page
of twenty rows and a total of eighty-three are both wrong if the rule is applied after the
database has already chosen the page. That is the reason, and it is not about speed: the
engine already caches user facts per request and evaluates many resources in one hydration
pass, so a per-row JavaScript check is not the bottleneck.

Because the filter must run in the database, a list needs the rule as SQL, and today that
second copy is written by hand. That is where the agreement failures above came from.

This is a compilation, not a replacement. Policies stay pure JavaScript functions that declare
what they need and then run arbitrary logic, because that is what a derived app extends. The
SQL form is an additional, generated way to evaluate the same term over many rows.

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

`createAccessibleDatasetIdsCte` already has this shape. Its three `scope` branches are three
path kinds. It returns ids only, so it discards which branch produced each row. The builder
generalises it to every resource type and keeps the path columns.

**Only one term needs hand-written SQL.** Group access is entirely user facts against resource
columns. Datasets and collections each need exactly one context-fact term, `userHasGrant`, and
its SQL form already exists as `accessibleDatasetIdsByGrantsQuery` and
`accessibleCollectionsByGrantsQuery`. Everything else compiles by parameter substitution: user
facts become query parameters, and resource facts stay columns.

**Every consumer reads that one statement.**

- **A list** joins on the statement and takes distinct `resource_id`. Its filters, sort, and pagination stay in the same query.
- **A single check** binds `resource_id` to one id. The action is allowed when any returned row satisfies it.
- **Standing** is the set of rows for one resource.
- **Capabilities** come from the same rows. One query fetches every path to the resource, and the action table decides all its actions from those rows without another query.

**Four inputs stay outside the statement.**

- **The platform admin** comes from the session's roles, and is checked once before the statement runs. A list compiler absorbs the four repeated `isPlatformAdmin(req)` branches in the list handlers, because platform admin means "no row filter".
- **Restrictions** block only mutating actions. A mutation joins `effective_restriction` for its one target. Reads never consult restrictions, so lists do not join it.
- **Attribute filters** project the fetched row according to its paths, after the query.
- **Terms that name no resource** stay as hydrated policies in the engine. Two examples are `isRequester` on an access request and `isSubject` on a grant.

This changes how the builtin dataset, collection, and group policies evaluate. `core/` stays
framework code and keeps its hydrator path for the terms above.

The per-check cost is estimated at one query, against several hydration queries today. That
estimate is unmeasured, and Phase 4 measures it.

### What compilation needs from `core`

Compiling a policy to SQL is blocked today by a property of the framework, and the plan has to
say so before Phase 4 is scheduled.

**`Policy.or`, `Policy.and`, and `Policy.not` return closures that discard their children.** A
combinator keeps the union of its `requires` and a concatenated name, and nothing else. There
is no accessor for the operator or for the child policies, which `Policy.test.js` confirms by
reading only `evaluate`, `name`, and `requires`. A compiler cannot turn `Policy.or([a, b, c])`
into a `UNION` without that tree, so `core/` must store the operator and its children. This is
a small addition, and it is a prerequisite rather than a consequence.

Three further `core` facts shape the same work.

- **The resource cache is keyed by id alone.** `PrismaHydrator` uses `${id}`, or `'global'` when there is no id, in one `Map` shared by every resource type. Two authorizations of different types under the same id in one request would share a record. No route does that today, so it is latent, but any design that authorizes several types in one request — a composed page, or a list over mixed resources — must key by type and id first.
- **Two containers are never frozen.** `user.js` and `audit.js` do not call `freeze()`, so a boot check asserting that every container is frozen fails on its first run until they are.
- **The decision-event mechanism works and is unused.** `core/authorize.test.js` exercises `events: {emit, eventToEmit}` fully, and `authorization/index.js` constructs the middleware factory with `events` undefined, so nothing is emitted in production. The harness can turn it on to record which policy decided each call, which is cheaper than inferring the path from the outcome.

### The restriction layer keeps its three lines

The earlier draft proposed deleting the service-level `is_archived` guards once the engine
resolved its targets. That was wrong, and the code says so. From
`tests/routes/groups.invitations.test.js`:

> The caller is an admin here, so the policy passes and ARCHIVED refuses. That matters beyond
> the status code: a blocked capability is also absent from the capability map, so the UI never
> offers the button. The service's own 409 is the second line, reached only if a group is
> archived between the check and the write.

The design is three-deep, and each line has a job.

| Line | Mechanism | What the caller sees | When it fires |
|---|---|---|---|
| 0 | the capability map omits the action | the button is never offered | always |
| 1 | middleware `checkRestriction` against `effective_restriction` | 403 | on every authorized route |
| 2 | the service guard, under `SELECT ... FOR UPDATE` | 409 | only between the check and the write |

Line 2 is a time-of-check-to-time-of-use guard. Removing it would open the race its row lock
exists to close.

**The defect is that the two lines ask different questions.** Line 1 asks
`effective_restriction`, which expands through `group_closure`. Line 2 reads `is_archived` on a
single row, which `archiveGroup` sets on one group. They agree for a group archived directly,
and disagree for a descendant: if a parent is archived inside the window, the child's own column
is still false and line 2 does not fire.

The fix keeps the design and changes only the predicate. One helper, `isRestricted(target)`,
reads `effective_restriction`, and the eleven guard sites call it inside the transactions they
already open. The 409 stays, the lock stays, the second line stays, and the two lines agree.
The four `ARCHIVED_ERROR_MESSAGE` constants, which hold four different strings, collapse to one.

This also settles what the denormalised column is for. `restrictions.test.js` asserts that the
column and the restriction table hold the same rows, and `archiveGroup` writes both in one
transaction, so they cannot drift. That test compares row sets, not reach, which is correct:
reach is a different question and belongs to the view. Once line 2 reads the view, the column is
purely presentational.

### The restriction check refuses when it cannot find a target

A mutating action on a grant or an access request with no resolvable target raises an error
that names the action. It no longer allows the action. Create actions resolve their target from
the owning group id, so an archived ancestor blocks them in the engine.

A test enumerates every route binding for a mutating action and asserts that a target resolves.
This extends `route_policy_bindings.test.js`, which today covers groups, collections, datasets,
and audit, and not grants, access requests, users, or public.

### Refusal of an under-specified question

An access check called without the information it needs raises rather than widening.
`userHasGrant` with no access types throws, the way `accessibleDatasetIdsByGrantsQuery` already
does. This is "refuse rather than fall back to a default" applied to authorization, and it is
the one class of defect the boot-time checks cannot catch, because the argument arrives at
runtime.

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

### One pipeline

The engine pipeline exists twice today: the Express middleware and `authorizeAction`. They
already differ, because `authorizeAction` does not restriction-filter capabilities. Both call
one function after this work, so "one definition" covers the pipeline and not only the rule.

### Current state has one definition

The views are the single definition of "active": `active_group_user`, `valid_grants`,
`active_collection_dataset`, `effective_user_groups`, `effective_user_oversight_groups`, and
`effective_restriction`. Every fragment reads a view, never a base table with its own filter.
`coverage.js` re-implements the `grant` term today. It becomes a reader of `accessPathsQuery`.

A test scans `api/src` for `removed_at: null`, `revoked_at: null`, and `is_archived: false`. It
fails on any hit outside an allowlist of history readers. This follows the shape of
`platformAdminShortCircuit.test.js`, which fails when a policy names the platform-admin role.

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

It returns the whole decision tuple, not a boolean, so the projection and refusal arms have
something to compare against.

`api/tests/model/tables.js` holds the three tables. A test asserts one action-table row for
each registered action, iterating `policyRegistry.listTypes()` rather than a literal list, so a
new action or a new container fails until someone classifies it.

### Worlds

A **world** is a set of groups, users, resources, grants, and restrictions. The harness builds
each world twice, once in the database and once in the reference model.

For a pair of one user and one dataset, the dimensions and all their values are:

| Dimension | Values | Count |
|---|---|---|
| Caller | anonymous; signed in; platform admin | 3 |
| Relation to the owning group | none; direct member; direct admin; member of a child group; admin of the parent; removed member; member whose `valid_until` passed | 7 |
| Grant subject | the user; a group the user belongs to; a group the user left; Authenticated Users; Public | 5 |
| Grant route | on the dataset; on a collection containing it; on a collection whose row was removed | 3 |
| Grant access type | the ten seeded types | 10 |
| Grant validity | active; revoked; superseded; expired; not yet started | 5 |
| Restriction | none; on the dataset; on a collection containing it; on the owning group; on the parent group | 5 |
| Dataset deleted | no; yes | 2 |

The anonymous caller is a dimension value rather than a separate suite, because anonymous
access is an ordinary path through the same rule. `subjects(u)` holds Public, and the profile
terms read resource columns only.

The full product is 157,500 pairs. Across 23 dataset actions that makes about 3.6 million
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

Each coverage assertion uses the failure-naming idiom, so a failure says which value is
unhandled.

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
| Projection | the projected key set from `permission.filter(resource)`, including nested and array paths | reference `fields` for the paths |
| Related rows | lineage, ancestors, and collection contents | reference decision for each row's own resource |
| Creates | the three create routes, against an archived owning group and an archived ancestor | reference `allowed` |
| Refusal | the status and body of every denial | reference `refusal` shape |
| Term forms | `getGrantAccessTypesForUser` against `accessibleDatasetIdsByGrantsQuery` | each other, row for row |

The last four arms are new in this revision, and each targets a defect class the earlier draft
could not express: projection applied to rows it was not decided for, creates that reach no
restriction target, refusals that leak existence, and the two forms of the grant term.

A list and a page agree by construction once both read `accessPathsQuery`. The list arm then
checks that the statement matches the reference. It keeps one cheap assertion that the list and
the page still share the statement.

Non-admin users carry the weight of every arm. A platform admin bypasses every policy, so an
admin-only run proves nothing about a policy path.

The output is a report of disagreements grouped by arm and by dimension, not a bare pass or
fail. Each disagreement is either a code bug or a gap in the specification. Gaps go to
[Decisions](./decisions.md).

**Known disagreements to confirm.** The first run should find these six:

- the group role precedence
- the group search leaving out resource access
- expiring grants for overseers
- an archived ancestor on create
- the overseer who also holds a sensitive-metadata grant, losing `staged_path`
- lineage rows carrying the parent dataset's field set

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

1. **Invariants.** Every invariant the model page states holds, and each assertion names the layer that owns it.
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
- `userHasGrant` throws when given no access types, and the two lifecycle tests that pass `access_type_id` are corrected so they can fail.
- The legacy `PATCH /datasets/:id` passes its body through the same way. It is v1, so it is recorded in [v2 cut-over](../v2-cutover.md) and not changed.

**Exit:** one refusal test per item fails before the fix and passes after it.

### Phase 1: write the model page

A new page, `access-model.md`, holds the base relations, the derived relations, the decision
tuple, the four planes, paths, projection, refusal shapes, non-edges, the non-escalation rule,
field provenance, invariant ownership, time, and the operations table with a decision in every
cell. The open decisions below are answered with the owner, and each answer goes to
[Decisions](./decisions.md).

**Exit:** no operations-table cell is undecided, every non-edge is listed with its test, every
invariant names its owning layer, every accept-shaped operation is checked against the
non-escalation rule, and every open decision is answered or explicitly deferred.

### Phase 2: the three tables, the reference model, and worlds

The isolated test database comes first. Then three small framework fixes, each of which a check
in this phase depends on: `PolicyRegistry` gains `listTypes()` so `restrictions.test.js` stops
hard-coding six resource types, `user.js` and `audit.js` call `freeze()`, and the resource cache
is keyed by type and id rather than id alone. This phase then builds:

- the term, action, and attribute tables, and the reference model over them
- the CI check that projects one seeded row of each resource type through every attribute rule, and reports each rule list whose results are not ordered by set inclusion
- the boot-time check comparing every policy's `requires` against the schema columns and the registered virtual attributes
- the CI check that hydrates every declared attribute against one seeded row of each type
- the completeness test for the `policyActionFor` workflow map
- the world generator, including the anonymous caller
- the coverage and sensitivity checks
- the generated decision table with its `--check` mode

**Exit:** the coverage check passes for every enum and every registered action, iterating the
registry. The sensitivity check passes for every dimension. Every declared attribute hydrates.
Every container is frozen. The ordering check reports the `dataset.js` rule lists, and nothing
else it reports is a surprise. The generator reports the engine-arm cell count and its run time.

### Phase 3: static agreement

Every comparison arm runs, and every disagreement is classified. Bugs get fixed. Gaps in the
specification go to Decisions.

**Exit:** no disagreement is unclassified. Each fixed bug has a harness cell that failed before
the fix. The six known disagreements were found.

### Phase 4: the rule becomes a query

This phase begins in `core/`. `Policy.or`, `Policy.and`, and `Policy.not` keep their operator
and their child policies, so a composed policy can be walked. Without that, a compiler cannot
turn `Policy.or([a, b, c])` into a `UNION`, and the rest of this phase has nothing to compile
from.

It then builds `accessPathsQuery` for datasets, collections, and groups, starting from
`createAccessibleDatasetIdsCte`, and moves each consumer onto that statement:

- the dataset list, collection search, group search, expiring grants, and `viewableDatasetIds`
- the single checks for the builtin dataset, collection, and group policies
- `coverage.js`
- the four repeated `isPlatformAdmin(req)` branches in the list handlers

It deletes the duplicate helpers and `explainDatasetAccess`, and adds the base-table scan test.
The `grant.js` resource-group terms move their service reads into a hydrator virtual attribute,
so `requires` becomes true again and a boot check can flag any async `evaluate`.

**Exit:**

- No list query or builtin policy restates a term.
- The scan test passes with only history readers on its allowlist.
- No policy declares facts it does not read, and none reads facts it does not declare.
- The harness stays green.
- The median query count and latency of a detail-page check are measured before and after the change.

### Phase 5: paths, standing, and projection

This phase builds everything the target shape describes for paths and fields:

- Capabilities and `_meta.standing` come from the path rows, and `_meta.standing` replaces `_meta.caller_role`.
- Attribute rules combine by key-set union over the matching path kinds, so a negation suppresses a key only when no other matching rule grants it positively. The Phase 2 ordering report says which rules change behaviour.
- `projectObject` stops deep-cloning through `JSON.parse(JSON.stringify(...))`, so a negation no longer throws on `BigInt` and no longer turns a `Date` into a string, and `'*'` stops aliasing nested objects back to the source row.
- The three related-row routes scope their queries to the parent, following `findDatasetRun`.
- The badge reads standing.
- The Access tab appears for every viewer.
- The persona gives way to the three facts from `/v2/users/me`.
- The UI scans run in CI.

**Exit:** the standing, projection, and related-row arms are green, and no v2 gate reads a role
literal.

### Phase 6: restrictions, operations, and creates

- The eleven `is_archived` guard sites call one `isRestricted` helper reading `effective_restriction`, inside the transactions they already open. The four message constants become one.
- Action rows declare a restriction class, and `MUTATING_ACTIONS` and `READING_ACTIONS` are deleted.
- The effects decided in Phase 1 are implemented, and the operation-sequence suite is built.

**Exit:**

- The seeded budget runs clean.
- Every operations-table cell has an assertion.
- A descendant of a group archived mid-transaction is refused by line 2, not only by line 1.
- Reverting one decided effect by hand makes the suite fail. That proves the suite can see the effect.

### Phase 7: keep it true

The v2 page patterns gain a checklist item. A new enum value, action, operation, or restriction
type extends the model page, the reference model, and the three tables. The tests from Phases 2
and 5 enforce this. The `authorization-engine` and `api-tests` skills record what the harness
taught.

**Exit:** adding a throwaway enum value in a scratch branch fails the coverage check, and
registering a throwaway container in `custom/` fails the action-table check.

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
9. **Archived ancestors and new datasets.** May a child of an archived group own new datasets? The view says no and the column says yes, so today the answer depends on which line asks.
10. **Zero admins.** `createGroup` accepts a root group with no admins, and creating a group does not make the creator an admin of it. Is zero admins an allowed state?
11. **The seeded grant on an ownership change.** Does the seeded grant move with the dataset? This matters only once ownership transfer exists. L1 T12 closes the accidental path.
12. **Batch shapes.** Three conventions exist for "some of the batch could not be done": `applyPendingInvitations` returns `{applied, skipped}` with a reason, `addDatasets` throws naming every invalid id, and the dataset bulk route returns partial results. Which is the house shape?
13. **Import as a decision surface.** Should "may this user import from this path" become a registered action with a policy, or stay a service-level check outside the engine?

## Out of scope

- **v1 routes.** They retire at cut-over, as [v2 cut-over](../v2-cutover.md) describes.
- **Races.** The concurrency suites own them, and database constraints enforce the two rules above.
- **The cost of the view queries.** Performance is measured separately if Phase 4 slows a list.
- **Bounded model checkers such as Alloy or TLA+.** They earn their cost when the hierarchy changes during its lifetime. Reparenting or delegated authority would be that trigger.

## How this is settled

The work is done when all of these hold:

- The model page has a decision in every cell.
- The generated table passes `--check` in CI.
- The engine, capabilities, lists, standing, projection, and refusal shapes agree with the reference model on every world cell.
- The seeded operation sequences run clean.
- A new enum value or action fails a test until someone handles it, and so does a new container registered in `custom/`.

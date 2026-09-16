---
title: A Request's Life in the API
order: 7
---

# A Request's Life in the API

This page follows one HTTP request through the API, from Express receiving it to the response
leaving. It covers authentication, validation, authorization, the service call, and how errors
become responses. It starts with the concepts, then walks a simple request and a complex one.

The walkthroughs name real files and functions, so each step can be read alongside the code.
The rules themselves are in [Access model](/design/groups/access-model.md); this page shows how
the code applies them.

## Concepts

### Authentication and authorization are separate steps

**Authentication** answers "who is calling". The API learns it from a signed token, and it
never looks the caller up in the database to do so.

**Authorization** answers "may this caller do this action on this thing". It runs after
authentication, once per route, and reads the database.

A request can pass authentication and still be refused by authorization. A request that fails
authentication never reaches authorization.

### The token

A token is a JSON Web Token (JWT). It is a signed piece of JSON the API issued at login.

- `api/src/services/auth.js` `onLogin` builds the caller's profile and signs it with `issueJWT`.
- The profile holds `username`, `email`, `name`, `roles`, `cas_id`, `id`, and `subject_id`.
- The token is signed with RS256, and it expires after `auth.jwt.ttl_milliseconds`, seven days by default.
- The UI stores the token and sends it as `Authorization: Bearer <token>` from `ui/src/services/api.js`.

`subject_id` is the caller's identity for every access decision. A user, a group, and the two
system groups Public and Authenticated Users each have one.

### Middleware

Express handles a request by running a chain of **middleware** functions in order. Each one
either calls `next()` to pass the request on, or calls `next(error)` to skip to the error
handlers. A route is itself a short chain: validators, then `authorize(...)`, then the handler.

`asyncHandler` in `api/src/middleware/asyncHandler.js` wraps an async handler. When the handler
throws, it passes the error to `next`, so a thrown error reaches the error handlers.

### Resource types, actions, and policies

A **resource type** is a kind of thing access is decided on: `dataset`, `collection`, `group`,
`grant`, `access_request`, `user`, or `audit`.

An **action** is something a caller does to one, such as `view_metadata` or `add_member`.

A **policy** is a function that returns true or false for one action. It is built from small
**terms**, such as "the caller administers the owning group", combined with `Policy.or` and
`Policy.and`.

A **policy container** holds every action of one resource type, with its policy. The containers
live in `api/src/authorization/builtin/policies/`. Each action is declared as `reading(...)`,
`readingData(...)`, or `mutating(...)`, and that label is its **restriction class**.

### Access paths

An **access path** is one reason a caller reaches a resource. There are four kinds:

- `admin`: the caller administers the group that owns the resource.
- `oversight`: the caller administers an ancestor of that group.
- `member`: the caller is a member of that group.
- `grant`: a grant names the caller, or a group the caller belongs to, on the resource.

One SQL statement, `accessPathsQuery` in `api/src/authorization/builtin/accessPaths.js`, returns
every path a caller has to a resource. The builtin terms decide from its result, which the
policy reads as `context.access_paths`:

- `kinds` is the set of path kinds found, such as `{'admin'}`.
- `access_types` is the set of access types the grant paths carry, widened by implication.

A term like `isDatasetOwningGroupAdmin` is then one line: `context.access_paths.kinds.has('admin')`.

### Hydration and the request cache

A policy declares which facts it needs in `requires`, split into `user`, `resource`, and
`context`. **Hydration** is loading those facts. A **hydrator** loads them for one entity, from
the database or from a registered loader.

Hydrators keep what they load in `req.policyContext.cache`, a set of maps that lives for one
request. A second check in the same request reuses the facts instead of querying again.

A route can hand over facts it already holds as **pre-fetched** values, so the hydrator does not
fetch them again.

### Resource state

A resource's **state** decides which actions it admits. An archived group admits no change to
itself or to what it owns. A deleted dataset keeps its record, admits no change, and has no
files to read. A decided access request is a record and never changes again.

Each resource type declares its own rules, in one file per resource under `api/src/state/builtin/`.
A rule is a pure function of the row the caller fetched, so the service asks it inside the
transaction that makes the change, after its row lock. A refusal is **409**, not 403: the caller
is not lacking authority, the resource is not in a state that admits the change.

The states and the moves between them are specified by
[the transition table](/design/groups/access-model.md#the-transition-table); the rule files are
where that table is enforced. The state layer also covers `invitation`, which has no policy
container of its own because invitations are authorized as actions on their group.

State binds everyone, platform admins included. Archiving reaches the group itself and the
datasets and collections it owns, and stops there: a sub-group keeps its own state until
somebody archives it.

A **restriction** is a separate idea — a rule somebody applies to a resource, which the engine
consults before every policy. No restriction type is specified yet, so the builtin checker
allows everything.

### The platform admin

A **platform admin** holds the `admin` role in `user_role`. The engine checks this once per
decision, and a platform admin is allowed every action no restriction blocks. No policy names
the role.

The check reads `current_roles` from the database on each request, not `roles` from the token.
A role removed after login stops working at once.

### Standing, capabilities, and the filter

**Standing** is the list of paths a caller has to a resource. It decides whether a refusal says
403 or 404, and the UI shows it as a badge.

**Capabilities** are the actions the caller may take on the resource right now. The UI shows a
button only when its action is in the list.

The **filter** is a function that removes the fields a caller may not see from an object. It is
built from the container's **attribute rules**, which pair a policy with a list of fields.

### Refusals: 401, 403, 404, and 409

- **401** means no valid token.
- **403** means the caller stands on the resource and is refused this action.
- **404** means the caller has no standing on the dataset, collection, or group the URL names.
  An unknown id answers the same way, so a stranger cannot tell the two apart.
- **409** means the resource's state does not admit the action. The caller's authority is not in
  question, which is why it is not 403.

The first three are authorization answering. The fourth is the resource answering, and it comes
from a different layer at a later point in the request. Every container answers an authorization
refusal with 403 unless standing is absent. See
[Refusal shapes](/design/groups/access-model.md#refusal-shapes).

## The fixed part of every request

Every request passes the same app-level middleware before reaching a route. The order is set in
`api/src/app.js`:

1. The upload server for `/uploads/files`.
2. `morgan`, which logs the request.
3. `express.json` and `express.urlencoded`, which parse the body into `req.body`.
4. `cookieParser` and `compression`.
5. `initializePolicyContext`, which creates the empty `req.policyContext.cache` maps.
6. The router in `api/src/routes/index.js`.
7. The error handlers, in order: `notFound`, `prismaNotFoundHandler`,
   `prismaConstraintFailedHandler`, `assertionErrorHandler`, `axiosErrorHandler`, and `errorHandler`.

The router in `api/src/routes/index.js` mounts a few routers that need no token: `/health`,
`/auth`, `/reports`, `/about`, `/env`, and `/public`. Then one line runs `authenticate` for
everything mounted below it.

`authenticate` in `api/src/middleware/auth.js` reads the bearer token, and falls back to the
`jwt` cookie. It verifies the signature with `checkJWT` and sets `req.user` to the token's
profile. A missing, expired, or forged token ends the request with 401.

The `/public` router uses `optionalAuthenticate` instead. A caller with no valid token becomes
the anonymous principal, which can satisfy only `view_profile`.

## A simple request: Alice reads a dataset

Alice administers the group that owns a dataset. The UI requests the dataset page:

```
GET /v2/datasets/7f3c…   Authorization: Bearer eyJ…
```

The route is in `api/src/routes/datasets_v2/index.js`:

```javascript
router.get(
  '/:id',
  validate([param('id').isUUID()]),
  authorize('dataset', 'view_metadata', { shouldDeriveCapabilities: true, shouldDeriveStanding: true }),
  asyncHandler(async (req, res) => { /* handler */ }),
);
```

### 1. Authentication

`authenticate` verifies Alice's token and sets `req.user` to her profile. Her `subject_id` is
now known.

### 2. Validation

`validate` in `api/src/middleware/validators.js` runs the `express-validator` rules. The id is a
UUID, so it calls `next()`. A malformed id would end the request with 400 and a list of errors.

### 3. Authorization

`authorize('dataset', 'view_metadata', …)` was built once, when the route file loaded. It
checked then that the `dataset` container and its `view_metadata` action exist. On each request
it runs the middleware in `api/src/authorization/core/middlewares.js`.

The middleware collects two identifiers: Alice's `subject_id` and the dataset id from
`req.params.id`. It passes `req.user` as the pre-fetched user. Then it calls `decide` from
`api/src/authorization/core/pipeline.js`, which runs four steps.

**Step 1, the restriction check.** `checkRestriction` in
`api/src/authorization/builtin/restrictions.js` asks whether a restriction blocks
`dataset.view_metadata`. No restriction type is specified, so it returns `null` for every
action, whatever the action's class, without a query. The seam stays live for an application
that injects a checker of its own.

Nothing about an archived group or a deleted dataset is decided here. That is the resource's
state, and it is asked later, by the service, inside the transaction that would perform the
write.

**Step 2, the platform-admin check.** The pipeline evaluates `isPlatformAdmin`. The user
hydrator loads `current_roles` from `user_role`. Alice is not a platform admin, so the pipeline
continues.

**Step 3, the action policy.** `authorizeWithFilters` in `api/src/authorization/core/authorize.js`
evaluates the policy from `api/src/authorization/builtin/policies/dataset.js`:

```javascript
view_metadata: reading(Policy.or([
  isDatasetOwningGroupAdmin,
  hasDatasetOwningGroupOversight,
  userHasGrant('DATASET:VIEW_METADATA'),
])),
```

Each term requires `context.access_paths`. `hydrateEntities` asks the context hydrator for it,
and the context hydrator runs `loadAccessPaths`. That runs `accessPathsQuery` for Alice and this
one dataset. One row comes back, with `path_kind = 'admin'`. `isDatasetOwningGroupAdmin` is
true, so the policy grants.

`authorizeWithFilters` then evaluates the attribute rules for `view_metadata`. Alice matches the
rule whose policy is `isDatasetOwningGroupAdmin`, with the field list `['*']`. The filter it
builds keeps every field.

**Step 4, capabilities and standing.** The route asked for both. `evaluateCapabilitySet`
evaluates every action in the dataset container for Alice, reusing the cached `access_paths`.
`filterRestrictedCapabilities` turns off any action a restriction blocks, which is none of them
today. `deriveStanding` returns her paths, `[{ kind: 'admin', … }]`.

The capability map is the caller's authority alone. What the dataset's state admits is the second
answer, and the route composes it beside this one as `_meta.available_actions` by asking
`src/state` with the row it already fetched.

The middleware stores the result as `req.permission` and calls `next()`.

### 4. The handler

The handler loads the dataset through `datasetService.getDatasetById`, asking for its owning
group, and responds with the filtered dataset and a `_meta` block carrying both answers:

```javascript
const dataset = await datasetService.getDatasetById(req.params.id, {
  includes: { owner_group: true },
});
res.json({
  ...req.permission.filter(dataset),
  _meta: {
    standing: req.permission.standing,
    capabilities: toCapabilitiesArray(req.permission.capabilities)
      .concat(await accessRequestsService.mayFileRequest({ user: req.user, resource_id: req.params.id })
        ? ['request_access'] : []),
    available_actions: state.availableActions('dataset', dataset),
  },
});
```

`toCapabilitiesArray` turns the map of action to boolean into a list of granted names.

The `includes` is what makes the second answer free. A dataset has no archived column of its own,
so its rules read `owner_group.is_archived`, and the group arrives with the row the handler
already fetched. `state.availableActions` is a pure call on that row and issues no query.

`request_access` is the one capability computed outside the action tables, so it has no state
rule and never appears in `available_actions`.

### The same request from other callers

| Caller | What differs | Response |
|---|---|---|
| Bob, holding a `DATASET:VIEW_METADATA` grant | The path row is `grant`, and `userHasGrant` is true. His attribute rule keeps only `PUBLIC_ATTRIBUTES`. | 200, with fewer fields and fewer capabilities |
| Frank, with no path to the dataset | The policy refuses. `refuse` finds no standing on a dataset. | 404 `Not Found` |
| A caller with no token | `authenticate` refuses before the route runs. | 401 |
| Any caller, with `id=abc` | `validate` refuses before `authorize` runs. | 400 |

## A complex request: Alice adds a member to a group

Alice administers the lab group, and she adds Carol as a member:

```
POST /groups/2a91…/members
{ "members": [{ "user_id": "c4d0…" }] }
```

This request changes data, so it passes two different gates. Authorization decides whether Alice
may add a member, before the handler runs. The group's own state decides whether it is accepting
changes at all, inside the database transaction. The route is in `api/src/routes/groups.js`:

```javascript
router.post(
  '/:id/members',
  validate([
    param('id').isUUID(),
    body('members').isArray({ min: 1 }),
    body('members.*.user_id').isUUID(),
  ]),
  authorize('group', 'add_member'),
  asyncHandler(async (req, res) => {
    await groupService.addGroupMembers(req.params.id, {
      actor_id: req.user.subject_id,
      user_ids: req.body.members.map((m) => m.user_id),
    });
    res.status(204).send();
  }),
);
```

Authentication and validation run as in the simple example.

### 1. The restriction check allows it

In `api/src/authorization/builtin/policies/group.js`, the action is `add_member: mutating(isGroupAdmin)`.
The engine calls the injected restriction checker before any policy runs. No restriction type is
specified, so the builtin checker returns `null` for every action and the pipeline continues.

Whether the lab is archived is not asked here, and it is not what the restriction checker is for.
That is the lab's own state, and the service asks a different layer about it in step 3.

### 2. The platform-admin check and the policy

Alice is not a platform admin. `isGroupAdmin` requires `context.access_paths`, and
`accessPathsQuery` runs with the group's resource type. It returns an `admin` row, so the policy
grants. The route asked for no capabilities or standing, so the middleware sets `req.permission`
and calls `next()`.

### 3. The service asks the state layer, inside a transaction

Nothing so far has asked whether the group is accepting changes. Authorization answered a
different question, and it answered it before the handler ran, so another request could archive
the group in between. `addGroupMembers` in `api/src/services/groups.js` therefore asks
`src/state` inside the transaction that makes the change:

```javascript
return prisma.$transaction(async (tx) => {
  state.assertPossible('group', 'add_member', await lockGroupForState(tx, group_id));

  // INSERT INTO group_user … ON CONFLICT … DO NOTHING RETURNING user_id
  // createMembershipAuditRecords(tx, …)
});
```

- `lockGroupForState` selects the group `FOR UPDATE`, so an archive of the same group waits until
  this transaction ends, and returns the row the state rule reads. A missing row is 404.
- `assertPossible` runs the group's `add_member` rule against that locked row and throws 409 when
  the state refuses. The row it reads is the row the insert will see.
- The insert skips a user who is already an active member, and returns only the users it added.
- The audit records are written in the same transaction, so a membership change and its audit row commit together.

The handler responds 204 with no body.

### 4. When the service throws

`createError.Conflict(...)` creates an error object with `status` 409. `asyncHandler` passes it to
`next`, which skips to the error handlers. `errorHandler` in `api/src/middleware/error.js` sends
the status and the message, because `http-errors` marks a 4xx error as safe to show. Any other
error becomes a plain 500, and its stack goes to the log.

A Prisma "record not found" error is turned into 404 by `prismaNotFoundHandler` before it reaches
`errorHandler`.

### Every outcome of this request

| Situation | Where it is decided | Response |
|---|---|---|
| Alice, active lab | the handler | 204 |
| No token | `authenticate` | 401 |
| `members` is empty, or a `user_id` is not a UUID | `validate` | 400 |
| Bob, a member of the lab | the policy refuses; `refuse` finds a `member` path | 403 `Forbidden` |
| Frank, with no path to the lab | the policy refuses; `refuse` finds no standing | 404 `Not Found` |
| Alice, and the lab is archived | `assertPossible` in the service, under the row lock | 409 `This group is archived, so it cannot be changed.` |
| A platform admin, and the lab is archived | the same check; being a platform admin is not a reason an archived group accepts a change | 409 |
| The lab's parent is archived, and the lab is not | nothing refuses it | 204 |
| The lab is archived after the middleware and before the insert | `assertPossible`, which reads the locked row | 409 |
| The group was deleted after the middleware | the `FOR UPDATE` select finds no row | 404 `Group not found` |

## When a route decides in its handler

Some routes cannot name the resource type before reading a row. `POST /access-requests` is one:
its body names a resource id, and only the row says whether that is a dataset or a collection.
Such a handler calls `authorizeAction(resourceType, action, options)` from
`api/src/authorization/index.js`. It runs the same `decide` pipeline as the middleware. The
handler then answers a refusal with `decision.status`.

A list route decides every row it returns. `decideRows` runs the pipeline once per row, and each
row carries its own `_meta`. For datasets, collections, and groups, one batched `access_paths`
query for the whole page seeds every row's check.

## Where to read next

- [Access model](/design/groups/access-model.md): the decision rule, standing, projection, and the transition table.
- [V2 page patterns](./v2-page-patterns.md): how the UI consumes `_meta.capabilities`,
  `_meta.available_actions`, and `_meta.standing`, and which of the two answers hides a control
  rather than disabling it.
- `api/src/authorization/custom/README.md`: adding a resource type in a derived application.

## Keeping this page current

This page names functions and files. When a change renames one, moves a middleware, or changes a
refusal status, update the walkthrough in the same change. Check each claim against the code,
not against this page.

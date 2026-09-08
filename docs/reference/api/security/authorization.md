---
title: Authorization
---

# Authorization

::: warning Two systems run at once
Bioloop currently enforces authorization through **two independent mechanisms**.
Which one applies depends on the route. Neither is deprecated in code, and there
is no shim between them — a route uses one or the other.
:::

| | Role-Based (RBAC) | Attribute-Based (ABAC) |
|---|---|---|
| Decides on | The caller's roles, plus an "own vs any" ownership check | Attributes of the user, the resource, and the request |
| Configured in | [`api/src/services/accesscontrols.js`](https://github.com/IUSCA/bioloop/blob/main/api/src/services/accesscontrols.js) | [`api/src/authorization/`](https://github.com/IUSCA/bioloop/tree/main/api/src/authorization) |
| Enforced by | `accessControl` middleware in [`api/src/middleware/auth.js`](https://github.com/IUSCA/bioloop/blob/main/api/src/middleware/auth.js) | `authorize()` from `@/authorization` |
| Backed by | The [`accesscontrol`](https://www.npmjs.com/package/accesscontrol) npm package | Policies and hydrators written in this repository |
| Used by | The original routes: `datasets`, `projects`, `users`, `workflows`, `uploads`, `instruments`, `alerts`, `metrics`, `notifications`, `statistics`, `system`, `fs`, `about`, `auth` | The groups-era routes: `groups`, `grants`, `collections`, `access_requests`, `datasets_v2`, `users_v2` |

**Write new routes against ABAC.** RBAC covers the pre-groups surface area and is
kept working, but it cannot express the group hierarchy, per-resource grants, or
time-bounded access that the current data model relies on.

Both mechanisms sit behind `authenticate`, described in
[Authentication](./authentication.md). Authorization always assumes an
authenticated `req.user`.

---

## Attribute-Based Access Control

The ABAC engine is the one to reach for. It is organized in three layers so that
applications derived from Bioloop can add their own rules without generating
merge conflicts against the base repository:

- **`core/`** — the framework: the `Policy` class, combinators, hydrator
  registry, and the `authorize()` engine. Never edited in a derived app.
- **`builtin/`** — Bioloop's own policies and hydrators, for groups, collections,
  users, and request context. Rarely edited in a derived app.
- **`custom/`** — policies and hydrators belonging to a derived app. This
  directory does not exist in the base repository.

A policy is a pure function that declares exactly which attributes it needs, so
the engine can fetch them once per request and cache them:

```javascript
const isGroupAdmin = new Policy({
  name: 'isGroupAdmin',
  resourceType: 'group',
  requires: {
    user: ['group_memberships'],
    resource: ['id'],
  },
  evaluate: (user, group) => user
    .group_memberships
    .some((m) => m.group_id === group.id && m.role === 'ADMIN'),
});
```

Routes never see policy internals; they ask the engine:

```javascript
const { authorize, POLICY_REGISTRY, hydratorRegistry } = require('@/authorization');

router.get('/groups/:id', async (req, res) => {
  const allowed = await authorize(
    POLICY_REGISTRY.group.getPolicy('view_metadata'),
    { user: req.user.id, resource: req.params.id, context: req.id },
    hydratorRegistry,
    req.policyContext,
  );
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  // ...
});
```

Policies compose with `Policy.or()`, `Policy.and()`, and `Policy.not()`.

The full reference lives beside the code, because it links directly to the files
it documents:

- [`api/src/authorization/README.md`](https://github.com/IUSCA/bioloop/blob/main/api/src/authorization/README.md) — architecture, invariants, and the policy and hydrator APIs
- [`api/src/authorization/core/README.md`](https://github.com/IUSCA/bioloop/blob/main/api/src/authorization/core/README.md) — the framework layer in detail
- [`api/src/authorization/custom/README.md`](https://github.com/IUSCA/bioloop/blob/main/api/src/authorization/custom/README.md) — extending authorization in a derived app

The data model that ABAC decisions read from — groups, grants, access types, and
the audit trail — is designed in [Hierarchical Groups](/design/groups/design.md).

---

## Role-Based Access Control

The older mechanism grants CRUD permissions per role, at two scopes: `own` and
`any`. The roles are `user`, `operator`, and `admin`, and the permission matrix
is in [`api/src/services/accesscontrols.js`](https://github.com/IUSCA/bioloop/blob/main/api/src/services/accesscontrols.js).

For example, letting `user` read and update only their own profile while `admin`
manages anyone's:

```javascript
{
  admin: {
    user: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
  },
  user: {
    user: {
      'read:own': ['*'],
      'update:own': ['*'],
    },
  },
}
```

The `accessControl` middleware resolves the scope from ownership and throws 403
when the role does not carry the permission:

```javascript
const { authenticate, accessControl } = require('../middleware/auth');

// resource ownership is checked by default
const isPermittedTo = accessControl('user');

router.get(
  '/:username',
  authenticate,
  isPermittedTo('read', { checkOwnership: true }),
  asyncHandler(async (req, res, next) => {
    const user = await userService.findActiveUserBy('username', req.params.username);
    if (user) { return res.json(user); }
    return next(createError.NotFound());
  }),
);
```

Without the middleware, the same check written by hand picks the scope itself —
`readOwn` when requester and owner match, `readAny` otherwise:

```javascript
const permission = (requester === resourceOwner)
  ? ac.can(roles).readOwn('user')
  : ac.can(roles).readAny('user');

if (!permission.granted) return next(createError(403));
```

Permission attribute lists also support exclusions, which is how the API prevents
a user from editing their own roles: `'update:any': ['*', '!roles']`.

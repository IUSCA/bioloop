---
name: api-service-tests
description: Write Jest integration/unit tests for API services in api/src/services/. Covers lifecycle, data invariants, and concurrency scenarios. Use this skill when the user asks to create, extend, or fix tests for any service file. Tests are real-integration (no mocks); a running database is assumed.
---

# Skill: API Service Tests

Integration and unit tests for Node.js services in `api/src/services/`.  
Tests live at `api/tests/services/`. Run: `cd api && npx jest tests/services/<path>`

---

## Stack

- **Framework**: Jest 29
- **Module alias**: `@/` → `src/` (via `module-alias`)
- **DB**: Prisma (`@/db`) — **never mock it**, always use a real DB
- **Errors**: `http-errors` — thrown errors have a `.status` property
- **Enums/types**: `@prisma/client`, `@/constants`, `@/authorization/builtin/audit`

---

## File Layout

Three files per service in a named subfolder:

```
api/tests/services/<service>/
  <service>.lifecycle.test.js    # CRUD round-trips, audit records
  <service>.invariants.test.js   # DB constraints, guard clauses, OCC
  <service>.concurrency.test.js  # Race conditions
```

Simple single-function utilities may use a single flat file.

---

## Required Bootstrap (every file)

Must appear **before** any `@/` import:

```js
const path = require('path');
global.__basedir = path.join(__dirname, '..', '..');  // adjust depth as needed
require('module-alias/register');

const prisma = require('@/db');
const myService = require('@/services/my-service');
```

---

## Shared Helpers

`api/tests/services/helpers.js` exports factory and cleanup functions for common entities (users, groups, datasets, collections, grants, access requests). Read the file to discover the exact signatures before use.

---

## Standard Structure

```js
let actor;
const createdIds = [];
const userIds = [];

beforeAll(async () => {
  actor = await createTestUser('_svc_actor');
  userIds.push(actor.id);
}, 20_000);

afterAll(async () => {
  for (const id of [...createdIds].reverse()) await deleteEntity(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await prisma.$disconnect();
}, 30_000);

async function newEntity(tag = '', overrides = {}) {
  const e = await myService.create({ ... }, actor.subject_id, overrides);
  createdIds.push(e.id);
  return e;
}

describe('my-service - lifecycle', () => { ... });
```

---

## Lifecycle Tests

Verify every CRUD operation end-to-end:

- **Create**: returned fields are correct; expected DB side-effects exist (verify via `prisma.*` queries after the call).
- **Update**: field persisted; version increments by 1; stale `expected_version` → 409.
- **Archive/unarchive**: `is_archived` toggles; `archived_at` set/cleared.
- **Delete**: row removed; dependent rows cleaned up.
- **Audit records**: query `prisma.authorization_audit` after each operation that should emit one.

---

## Invariants Tests

Verify DB constraints and service guard clauses hold:

- **DB constraints**: attempt violation directly via `prisma.*`; assert `.rejects.toThrow()`.
- **Archived guard**: mutating an archived entity → `rejects.toMatchObject({ status: 409 })`.
- **OCC**: stale `expected_version` → 409; confirm no second write landed.
- **Uniqueness**: duplicate create → throws.
- **State machine**: invalid transition → throws.
- **Computed/view semantics**: insert raw data, query view/computed column, assert result.

After any expected failure, query the DB to confirm no partial write occurred:
```js
const count = await prisma.model.count({ where: { ... } });
expect(count).toBe(0);
```

---

## Concurrency Tests

- **Always** use `Promise.allSettled()` — never `Promise.all()` when failures are expected.
- Count `fulfilled`/`rejected` explicitly; verify DB state after the race.
- Use `afterEach` (not `afterAll`) when tests create conflicting data.

**OCC race** — exactly one write wins:
```js
const results = await Promise.allSettled([
  service.update(id, { description: 'A', expected_version: 1 }),
  service.update(id, { description: 'B', expected_version: 1 }),
]);
expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
expect(results.filter((r) => r.status === 'rejected')[0].reason.status).toBe(409);
// confirm DB version = 2
```

**Idempotent operations** (e.g. `ON CONFLICT DO NOTHING`):
```js
const results = await Promise.allSettled([
  service.addMember(entityId, userId),
  service.addMember(entityId, userId),
]);
expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);
const count = await prisma.model.count({ where: { ... } });
expect(count).toBe(1);
```

**Archive vs mutation race**: assert final DB state reflects a consistent outcome regardless of which operation won.

---

## Cleanup Rules

Respect FK order — delete leaf rows before parent rows. Use `.catch(() => {})` on every cleanup call. Always call `prisma.$disconnect()` in `afterAll`.

---

## Integration vs Unit

| Service type | Approach |
|---|---|
| Uses Prisma | Integration — real DB, no mocks |
| Pure computation | Unit — no DB or bootstrap needed |
| Calls external HTTP | Mock at the HTTP boundary (`jest.spyOn` / `jest.mock`) |

---

## Examples in the Repo

```
api/tests/services/groups/        — lifecycle, invariants, concurrency, hierarchy
api/tests/services/grants/        — lifecycle, invariants, concurrency
api/tests/services/collections/   — lifecycle, invariants, concurrency
api/tests/services/access-requests/
api/tests/services/nonce.test.js  — single-file utility example
api/tests/services/helpers.js     — shared factories and cleanup
```

---

## Checklist

- [ ] Bootstrap block before any `@/` import in every file
- [ ] No Prisma mocks
- [ ] `beforeAll`/`afterAll` timeouts: `20_000` / `30_000`
- [ ] `prisma.$disconnect()` in every `afterAll`
- [ ] All fixtures tracked and cleaned up in FK order with `.catch(() => {})`
- [ ] Concurrency tests use `Promise.allSettled()`
- [ ] Service errors asserted with `.rejects.toMatchObject({ status: N })`
- [ ] DB state verified via `prisma.*` after each operation
- [ ] Run tests and fix all failures before stopping

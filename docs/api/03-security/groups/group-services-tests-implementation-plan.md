## Plan: Service Integration Tests (Lifecycle, Concurrency, Invariants)

**TL;DR:** 13 files under services — one shared `helpers.js` and 3 files per service (`lifecycle`, `concurrency`, `invariants`). Tests call service functions directly against a live DB. No mocks, no supertest. Cleanup is done in `afterAll` blocks in reverse FK order. Test data is isolated by unique `Date.now()` suffixes. Each file begins with `require('module-alias/register')` and sets `global.__basedir` to match `app.js` runtime conventions.

---

**File tree**
```
api/tests/services/
├── helpers.js
├── access-requests/
│   ├── access-request.lifecycle.test.js
│   ├── access-request.concurrency.test.js
│   └── access-request.invariants.test.js
├── grants/
│   ├── grants.lifecycle.test.js
│   ├── grants.concurrency.test.js
│   └── grants.invariants.test.js
├── groups/
│   ├── groups.lifecycle.test.js
│   ├── groups.concurrency.test.js
│   └── groups.invariants.test.js
└── collections/
    ├── collections.lifecycle.test.js
    ├── collections.concurrency.test.js
    └── collections.invariants.test.js
```

---

**Steps**

**1. Create `api/tests/services/helpers.js`**

Provides factory functions used across all test files. The module sets up the alias and basedir at the top so callers don't need to. Exports:

- `createTestUser(tag?)` — `prisma.user.create` with a unique username/email. Returns `{ id, username }`.
- `createTestGroup(actorId, tag?, overrides?)` — calls `groupsService.createGroup(...)`. Returns group.
- `createTestChildGroup(parentId, actorId, tag?)` — calls `groupsService.createChildGroup(...)`. Returns group.
- `createTestDataset(ownerGroupId, tag?)` — `prisma.dataset.create` with minimal required fields (`name`, `type`, `owner_group_id`). Returns dataset.
- `createTestCollection(ownerGroupId, actorId, tag?)` — calls `collectionsService.createCollection(...)`. Returns collection.
- `getAccessTypeId(name, resourceType)` — `prisma.grant_access_type.findFirstOrThrow({ where: { name, resource_type } })`. Returns `id`.
- `cleanupIds` — a simple helper that accumulates created IDs and deletes them in the right FK order at the end of a test suite. Optional; tests may also clean up inline.

---

**2. `api/tests/services/access-requests/access-request.lifecycle.test.js`**

`beforeAll`: create `requester` user, `reviewer` user, one dataset owned by a fresh group; resolve `VIEW_METADATA` and `DOWNLOAD` access type IDs for DATASET. `afterAll`: delete access requests → grants → dataset → group → users.

Tests (`describe('access-request lifecycle')`):

- **DRAFT creation** — `createAccessRequest` returns status `DRAFT`, items have `decision = PENDING`, `submitted_at` is null, audit row with `REQUEST_CREATED` event exists.
- **Item uniqueness on creation** — creating two items with the same `access_type_id` in one request throws the DB unique constraint (the `@@unique([access_request_id, access_type_id])` constraint on `access_request_item`).
- **Update DRAFT items** — `updateAccessRequest` replaces items completely; old item gone, new item present, audit row `REQUEST_UPDATED` created.
- **DRAFT → UNDER_REVIEW** — `submitRequest` transitions to `UNDER_REVIEW`, sets `submitted_at`, creates `REQUEST_SUBMITTED` audit row.
- **UNDER_REVIEW → APPROVED (single item)** — `submitReview` with all items `APPROVED` → status `APPROVED`, item `decision = APPROVED`, `created_grant_id` is set, a grant row is created with matching `subject_id`, `access_type_id`, `resource_id`.
- **UNDER_REVIEW → REJECTED (single item)** — all items `REJECTED` → status `REJECTED`, no grant created.
- **UNDER_REVIEW → PARTIALLY_APPROVED (two items)** — approve `VIEW_METADATA`, reject `DOWNLOAD` → status `PARTIALLY_APPROVED`, grant created only for approved item, rejected item has `created_grant_id = null`.
- **Decision reason stored** — `submitReview` with `decision_reason` → field persisted on the access request.
- **DRAFT → WITHDRAWN** — `withdrawRequest` from DRAFT → status `WITHDRAWN`, `closed_at` set, audit `REQUEST_WITHDRAWN`.
- **UNDER_REVIEW → WITHDRAWN** — `withdrawRequest` from UNDER_REVIEW → same expectations.
- **`expireStaleRequests`** — submit a request, backdate `submitted_at` to 30 days ago via `prisma.access_request.update`, call `expireStaleRequests({ max_age_days: 7 })` → returns count ≥ 1, request status is `EXPIRED`, `closed_at` set, audit `REQUEST_EXPIRED`.
- **`expireStaleRequests` skips non-stale requests** — a freshly submitted request is not expired.
- **`getRequestsByUser` pagination** — create 3 requests for the same user; `getRequestsByUser({ ..., limit: 2 })` returns `total: 3`, `data.length: 2`.
- **`getRequestsPendingReviewForUser`** — UNDER_REVIEW request for a dataset owned by `reviewer`'s admin group appears in queue; DRAFT request does not appear.
- **`getRequestsReviewedByUser`** — approved request appears under reviewer's reviewed list.

---

**3. `api/tests/services/access-requests/access-request.concurrency.test.js`**

`beforeAll`/`afterAll` same cleanup pattern.

Tests:

- **Concurrent submit of the same request** — create one DRAFT request; fire `Promise.allSettled([submitRequest(id, uid), submitRequest(id, uid)])`. Assert: exactly 1 fulfilled, exactly 1 rejected with a `409` (`Conflict`) error. Assert final status `UNDER_REVIEW`.
- **Concurrent review by two reviewers** — submit a request to `UNDER_REVIEW`; fire `Promise.allSettled([submitReview({...}), submitReview({...})])` (different reviewer IDs, same decisions). Assert: exactly 1 fulfilled, exactly 1 `409`. Assert the request row has exactly one `reviewed_by` populated and exactly one set of grants.
- **Review vs withdraw race** — submit to `UNDER_REVIEW`; fire `Promise.allSettled([submitReview({...APPROVED...}), withdrawRequest({...})])`. Assert: exactly one succeeds. If `APPROVED` won: grant is created, status `APPROVED`. If `WITHDRAWN` won: no grant, status `WITHDRAWN`. In both cases, exactly one outcome.
- **Concurrent withdraw attempts** — UNDER_REVIEW request; fire `Promise.allSettled([withdrawRequest(id), withdrawRequest(id)])`. Exactly 1 fulfills, 1 `409`.
- **Concurrent withdraw from DRAFT** — same as above but state is DRAFT. Both call `withdrawRequest`; exactly one wins.
- **Submit while already UNDER_REVIEW** — submit once, then call `submitRequest` again on the same ID → throws `409` immediately (status guard fires).
- **Sequential duplicate submit (same resource + access type)** — create request A and B for same dataset and `VIEW_METADATA`; submit A → succeeds; submit B → `_assertNoInFlightRequests` throws because A is UNDER_REVIEW.

---

**4. `api/tests/services/access-requests/access-request.invariants.test.js`**

Tests:

- **No duplicate active grants after approval** — approve a request, attempt to create a second request for the same access type, submit it → `submitRequest` throws because `_assertNoActiveGrants` detects the existing grant.
- **Revoked grant clears the block** — approve request → `revokeGrant` → create and submit a second request for the same access type → succeeds (revoked grant is not active).
- **Review decisions must cover all items** — `submitReview` with only a subset of item IDs → `_validateReviewItems` throws `Conflict`.
- **Review decisions must not include foreign item IDs** — `submitReview` with an item ID from a different request → `_validateReviewItems` throws.
- **Items are immutable once UNDER_REVIEW** — `updateAccessRequest` after `submitRequest` → `updateMany WHERE status='DRAFT'` returns `count=0` → throws `409`.
- **`closed_at` is set on every terminal transition** — after APPROVED/REJECTED/WITHDRAWN/EXPIRED, `closed_at` is not null.
- **Grant created by review carries `creation_type = ACCESS_REQUEST`** — verify the auto-created grant row.
- **`submitted_at` is set only on submit** — DRAFT has `submitted_at = null`; after `submitRequest`, `submitted_at` is a valid date within a second of the call.

---

**5. `api/tests/services/grants/grants.lifecycle.test.js`**

`beforeAll`: create user, group (with user as member), dataset (owned by group). `afterAll`: delete grant rows, audit rows for grants, dataset, group, user.

Tests:

- **Create USER grant** — `createGrant` returns grant with `subject_type='USER'`, `revoked_at=null`, `valid_from ≤ now()`.
- **Create GROUP grant** — `subject_type='GROUP'`, `subject_id = group.id`.
- **Audit row on create** — a `GRANT_CREATED` `authorization_audit` row exists after `createGrant`.
- **`getGrantById`** — returns the just-created grant with correct fields.
- **`revokeGrant`** — returns grant with `revoked_at` set and `revoked_by = actor_id`. Audit row `GRANT_REVOKED` present.
- **`userHasGrant` — true before revoke, false after** — direct USER grant scenario.
- **`userHasGrant` — via group** — GROUP grant to a group the user is member of → `userHasGrant` returns `true`.
- **`getUserGrantAccessTypesForUser`** — returns a `Set` containing the access-type name; after revoke returns empty `Set`.
- **`listGrantsForSubject` pagination** — create 3 grants for same user; `limit: 2` returns `total: 3`, `data.length: 2`.
- **`listGrantsForResource` active filter** — active=true excludes revoked grants; active=false lists only non-active.
- **`listAccessTypes`** — returns non-empty array; each entry has `name`, `resource_type`.
- **Time-bounded grant observed as active** — grant with `valid_until = now + 1hr` is active; after simulating expiry (set `valid_until` to past) `userHasGrant` returns false.

---

**6. `api/tests/services/grants/grants.concurrency.test.js`**

Tests:

- **Concurrent USER grants for same subject/resource/access_type** — `Promise.allSettled([createGrant(A), createGrant(A)])` → exactly 1 fulfilled, 1 rejected. The rejection carries the `GRANT_OVERLAP_ERROR_MSG` Conflict error. Exactly 1 grant row in DB.
- **Concurrent GROUP grants for same group/resource/access_type** — same as above for GROUP subject type.
- **Non-overlapping windows are both allowed** — two grants for same subject/resource/access_type but windows `[now, +1yr)` and `[+1yr, +2yr)` — both succeed (exclusion constraint uses `&&` overlap, not equality).
- **Concurrent revoke of the same grant** — `Promise.allSettled([revokeGrant(id, {actor_id: u1}), revokeGrant(id, {actor_id: u2})])` — Prisma `update({where:{id}})` serializes writes; both succeed or one wins, but the final `revoked_at` is set and non-null. The grant is revoked. At most one `GRANT_REVOKED` audit row… (assert exactly one audit row with this grant target).
- **Create after revoke unblocks the exclusion constraint** — create grant, revoke it, create second grant for same subject/resource/access_type → second creation succeeds because revoked grants satisfy the `WHERE (revoked_at IS NULL)` predicate exclusion.
- **Concurrent create + revoke of same grant** — `Promise.allSettled([createGrant(A), revokeGrant(existing_grant_id)])` — since they target different rows they don't race; both succeed.

---

**7. `api/tests/services/grants/grants.invariants.test.js`**

Tests:

- **`valid_period` computed column matches `[valid_from, valid_until)`** — query `SELECT valid_period FROM grant WHERE id = $1`; assert lower = `valid_from`, upper = `valid_until`, bounds = `[)`.
- **`valid_grants` view excludes revoked** — revoke a grant; query `SELECT * FROM valid_grants WHERE id = $1` via `$queryRaw` → no rows returned.
- **`valid_grants` view excludes future grants** — grant with `valid_from = now + 1hr`; query returns 0 rows.
- **`valid_grants` view excludes expired grants** — grant with `valid_until = now - 1s`; query returns 0 rows.
- **Grant for non-existent resource type rejects at DB** — attempt `prisma.grant.create` with `resource_type = 'INVALID'` → Prisma known request error (enum constraint).
- **Transitive group membership grant** — create parent group G1, child G2; add user to G2; create GROUP grant for G1 → `getUserGrantAccessTypesForUser` on the user returns the access type (transitive via `effective_user_groups` view).
- **EVERYONE group grants apply to all users** — create a grant with `subject_type='GROUP', subject_id=EVERYONE_GROUP_ID`; call `userHasGrant` for a user not in any group → returns `true`.

---

**8. `api/tests/services/groups/groups.lifecycle.test.js`**

`beforeAll`: create 2 test users (`actor`, `member`). `afterAll`: delete groups (cascades closure + memberships), users.

Tests:

- **`createGroup` — self-closure row exists** — after create, `prisma.group_closure.findUnique({ where: { ancestor_id_descendant_id: {ancestor_id: g.id, descendant_id: g.id} } })` returns `{ depth: 0 }`.
- **`createGroup` — audit row** — `authorization_audit` has `GROUP_CREATED` event for this group.
- **`createChildGroup` — direct closure row** — `group_closure` has row `(parent_id, child_id, depth=1)`.
- **`createChildGroup` — transitive closure (3 levels)** — create grandparent → parent → child; assert `(grandparent_id, child_id, depth=2)` row exists.
- **`getGroupDescendants` / `getGroupAncestors`** — descendants of grandparent include parent and child; ancestors of child include parent and grandparent.
- **`updateGroupMetadata` — name change regenerates slug** — change name to something new; returned slug differs from original; new slug is URL-friendly.
- **`updateGroupMetadata` — version increments on each write** — version = 1 after create; version = 2 after one update; version = 3 after second.
- **`updateGroupMetadata` — metadata deep merge** — existing `{ type: 'lab', pi: 'Alice' }`, update with `{ tags: ['genomics'] }` → merged result contains all three keys.
- **`archiveGroup`** — `is_archived = true`, `archived_at` is set.
- **`unarchiveGroup`** — `is_archived = false`, `archived_at` is null.
- **`addGroupMembers`** — `listGroupMembers` count increases; newly added member has `role = MEMBER`.
- **`removeGroupMembers`** — after remove, `listGroupMembers` no longer contains the user.
- **`promoteGroupMemberToAdmin`** — `role` changes to `ADMIN`.
- **`removeGroupAdmin`** — `role` changes back to `MEMBER`.

---

**9. `api/tests/services/groups/groups.concurrency.test.js`**

Tests:

- **Concurrent `updateGroupMetadata` with same version** — `Promise.allSettled([update(v1), update(v1)])` → exactly 1 fulfills, 1 throws with `CONFLICT_ERROR_MESSAGE`. Final version is 2, not 3.
- **Concurrent `updateGroupMetadata` with correct successive versions** — serial `await update(v1)` → `await update(v2)` → both succeed, final version is 3.
- **Concurrent `addGroupMembers` for the same user** — `Promise.allSettled([addGroupMembers(gid, userId), addGroupMembers(gid, userId)])` → one succeeds, one fails (Prisma P2002 unique constraint on `[group_id, user_id]`). Exactly 1 membership row exists.
- **Concurrent `removeGroupMembers` for the same user** — both calls resolve (the second finds 0 rows but doesn't throw), group has 0 memberships after.
- **Concurrent `createChildGroup` under the same parent** — two different names; `Promise.allSettled([createChildA, createChildB])` → both succeed; closure table has both children; `getGroupDescendants` on parent returns both.
- **Concurrent archive + addGroupMembers** — `Promise.allSettled([archiveGroup(gid), addGroupMembers(gid, userId)])` → if archive wins first, `addGroupMembers` throws the archived error. Result is deterministic: exactly one terminal state.
- **Concurrent `promoteGroupMemberToAdmin` and `removeGroupAdmin`** — both target the same user; `Promise.allSettled(...)` → exactly one wins; final role is consistent (either `ADMIN` or `MEMBER`, never corrupted).

---

**10. `api/tests/services/groups/groups.invariants.test.js`**

Tests:

- **Cannot add member to EVERYONE group at DB level** — `prisma.group_user.create({ data: { group_id: EVERYONE_GROUP_ID, user_id: ... } })` → throws with a Prisma known error (CHECK constraint `no_everyone_members`).
- **Cannot create closure row involving EVERYONE group** — `prisma.group_closure.create({ data: { ancestor_id: EVERYONE_GROUP_ID, ... } })` → CHECK constraint `no_everyone_hierarchy` fires.
- **Archived group blocks `updateGroupMetadata`** — `archiveGroup` → `updateGroupMetadata(any_version)` → throws `ARCHIVED_ERROR_MESSAGE` (the check happens before the version lock, so even a correct version throws).
- **Slug is always unique** — create group with name "Alpha"; create another group with name "Alpha" → unique constraint on `group.name` fires (Prisma P2002). OR: if names differ but slugs collide, `generate_slug` appends a suffix and both succeed.
- **Closure self-row always exists** — `createGroup` and `createChildGroup` both produce a self-closure (depth=0). Verified by directly querying `group_closure` after creation.
- **`group.version` starts at 1** — freshly created group has `version = 1`.

---

**11. `api/tests/services/collections/collections.lifecycle.test.js`**

`beforeAll`: create actor user, owner group, 3 datasets in that group, 1 "foreign" dataset owned by a different group, 1 deleted dataset (`is_deleted=true`) in the owner group. `afterAll`: delete collections, datasets, groups, users.

Tests:

- **`createCollection`** — returns collection with correct `owner_group_id`, `slug` derived from name, `is_archived=false`, `version=1`.
- **`updateCollectionMetadata`** — name change → slug updated; `version` incremented.
- **`archiveCollection`** — `is_archived=true`, `archived_at` set.
- **`unarchiveCollection`** — `is_archived=false`, `archived_at` cleared.
- **`deleteCollection`** — after delete, `getCollectionById` throws (row gone).
- **`addDatasets` — happy path** — add 2 datasets; `listDatasetsInCollection` returns exactly those 2.
- **`addDatasets` — cross-group rejection** — adding the foreign dataset throws a `400`-class error; `collection_dataset` row is not created.
- **`addDatasets` — deleted dataset rejection** — adding the `is_deleted=true` dataset throws; no row created.
- **`removeDatasets`** — add 2, remove 1 → `listDatasetsInCollection` returns only the remaining one.
- **`findCollectionsByDataset`** — add dataset D to collection C1 and C2; `findCollectionsByDataset({ dataset_id: D.id })` returns both.
- **`findCollectionsByOwnerGroup`** — returns only collections owned by the queried group.
- **`listDatasetsInCollection` pagination** — add 3 datasets; `limit: 2` returns `total: 3`, `data.length: 2`.

---

**12. `api/tests/services/collections/collections.concurrency.test.js`**

Tests:

- **Concurrent `updateCollectionMetadata` with same version** — `Promise.allSettled([update(v1), update(v1)])` → exactly 1 fulfills, 1 `409`. Final version is 2.
- **Concurrent `addDatasets` with same dataset** — `Promise.allSettled([addDatasets([d.id]), addDatasets([d.id])])` → one succeeds, one throws (Prisma P2002 unique on `[collection_id, dataset_id]`). Exactly 1 `collection_dataset` row exists.
- **Concurrent `addDatasets` with different datasets** — both succeed; both rows exist.
- **Concurrent `removeDatasets` same dataset** — both calls resolve without error (second finds 0 deletees but does not throw); dataset is not in collection after both complete.
- **Concurrent archive + addDatasets** — `Promise.allSettled([archiveCollection(cid), addDatasets(cid, [d])])` → archive wins → any `addDatasets` that commits after archive throws `ARCHIVED_ERROR_MESSAGE`. Result: collection is archived and dataset is not in it.
- **Concurrent `deleteCollection` + `addDatasets`** — if delete wins, `addDatasets` fails with FK violation (collection gone). No orphaned `collection_dataset` rows.

---

**13. `api/tests/services/collections/collections.invariants.test.js`**

Tests:

- **Dataset must belong to same group as collection** — verified end-to-end: no cross-group `collection_dataset` row can exist (service-level validation in `addDatasets`).
- **Archived collection blocks `addDatasets`** — throws `ARCHIVED_ERROR_MESSAGE`; no row inserted.
- **Archived collection blocks `removeDatasets`** — throws same error.
- **Archived collection blocks `updateCollectionMetadata`** — throws same error regardless of version.
- **`collection.version` starts at 1** — freshly created collection has `version = 1`.
- **`collection.slug` is unique** — attempt to create two collections with colliding names → slug generator appends suffix; both succeed with distinct slugs. OR if names are identical, unique constraint on `group.name` fires with P2002.
- **Deleted collection leaves no `collection_dataset` rows** — add datasets, then `deleteCollection`; query `prisma.collection_dataset.findMany({ where: { collection_id } })` returns empty array (cascade or service handles cleanup).

---

**Verification**

```bash
cd api
# sequential first to confirm no cross-test state bleed
npx jest tests/services/ --runInBand --verbose
# then parallel
npx jest tests/services/ --verbose
```

Each test file should show only its own describe-block names. No test should rely on data created in another file. Cleanup failures (e.g., FK order errors) will surface clearly in `afterAll`.

---

**Decisions**

- **Grouped by property, not by service** — lifecycle, concurrency, and invariants test files exist per service, so a single `jest --testPathPattern access-request.concurrency` can run in isolation.
- **`Promise.allSettled` over `Promise.all` in concurrency tests** — ensures both branches are inspectable even when one rejects; assertions check the settled outcomes explicitly.
- **No mocked time** — `expireStaleRequests` tests backdate `submitted_at` directly via `prisma.access_request.update` rather than mocking `Date.now`, matching the stated preference.
- **`afterAll` cleanup per describe block** — deletes in reverse FK order: grants/request_items → access_requests → datasets → collections → groups → users.
- **`getAncestorGroups` / `getDescendantGroups` in groups service take a `tx` argument** — tests call the public `getGroupAncestors` / `getGroupDescendants` wrappers instead (they take only `group_id`).
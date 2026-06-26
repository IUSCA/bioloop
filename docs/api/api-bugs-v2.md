

### 2. access_requests.js — `_createGrant` accesses missing properties on `reviewItem`

In `submitReview`, `itemDecisionsMap` is built from `item_decisions` (the payload from the route), which has only `{ id, decision, comment }`. But `_createGrant` then accesses:

```js
access_type_id: reviewItem.access_type.id,   // TypeError: cannot read .id of undefined
valid_until: reviewItem.approved_until,       // undefined; route doesn't accept this field
```

The `access_type_id` should come from `requestItem` (the DB record), and `approved_until` is not validated by the route at all.

---

### 3. access_requests.js — missing `await` in `getRequestsPendingReviewForUser`

```js
const data = prisma.access_request.findMany(...)  // BUG: no await
return { metadata: ..., data };                    // data is a Promise, not an array
```

---

### 4. access_requests.js — wrong `event_type` in audit records for `updateAccessRequest` and `submitRequest`

Both incorrectly use `AUTH_EVENT_TYPE.REQUEST_CREATED`:

```js
// updateAccessRequest — action: 'UPDATE'
event_type: AUTH_EVENT_TYPE.REQUEST_CREATED,   // should be REQUEST_UPDATED

// submitRequest — action: 'SUBMIT'
event_type: AUTH_EVENT_TYPE.REQUEST_CREATED,   // should be REQUEST_SUBMITTED
```

---

### 5. access_requests.js — `getReviewedRequestsByUser` signature mismatch

The service is declared:
```js
async function getReviewedRequestsByUser(user_id, { sort_by, sort_order, offset, limit }) {
```
But the route calls it as:
```js
accessRequestsService.getReviewedRequestsByUser({ user_id: req.user.id, sort_by, ... })
```
`user_id` lands as the whole options object; actual query uses `where: { reviewed_by: user_id }` which will always be wrong. Compare how `getRequestsByUser` correctly uses the object pattern.

---

### 6. collections.js — `createCollection` never persists `owner_group_id`

```js
const _collection = await tx.collection.create({
  data: {
    name: data.name,
    slug,
    description: data.description,
    metadata: data.metadata,
    // owner_group_id is silently dropped
  },
```
Despite `owner_group_id` being required validation at the route level and central to all group-scoped access control queries (`searchCollectionsForUser`, `addDatasets`, `findCollectionsByOwnerGroup`, etc.), it's never written.

---

### 7. groups.js — `addGroupMembers` INSERT escapes its own transaction

The `FOR UPDATE` lock is acquired via `tx`, but the INSERT runs on `prisma` directly:

```js
return prisma.$transaction(async (tx) => {
  const groupRows = await tx.$queryRaw`SELECT ... FOR UPDATE;`;  // lock via tx ✓
  ...
  const createdRecords = await prisma.$queryRaw`INSERT ...`;     // BUG: uses prisma, not tx
```
The lock is ineffective; the INSERT is not rolled back on failure.

---

### 8. groups.js — `searchAllGroups` has inverted condition; text search never runs

```js
if (group_id) {
  where.id = group_id;
} else if (!search_term) {   // BUG: should be `else if (search_term)`
  where.OR = [
    { name: { contains: search_term, mode: 'insensitive' } },  // search_term is null here
```
The `OR` filter is applied when `search_term` is **absent**, and skipped when it's **present** — exact inversion of intent.

---

### 9. groups.js — `archiveGroup` and `unarchiveGroup` don't return the updated record

Both functions discard the result of `tx.group.update(...)`:

```js
async function archiveGroup(group_id, actor_id) {
  return prisma.$transaction(async (tx) => {
    await tx.group.update({ ... });  // result silently discarded
    await tx.authorization_audit.create({ ... });
    // returns undefined
  });
}
```

Both routes then call `req.permission.filter(archivedGroup)` on `undefined`, which will throw or silently return an invalid response.

---

### 10. groups.js — `archiveGroup` and `unarchiveGroup` don't pass `actor_id`

```js
const archivedGroup = await groupService.archiveGroup(id);         // missing req.user.id
const unarchivedGroup = await groupService.unarchiveGroup(id);     // missing req.user.id
```
The service signature is `archiveGroup(group_id, actor_id)`, so every audit record for archive/unarchive actions will have `actor_id: undefined`.

---

### 11. collections.js — `userHasGrant` passes wrong parameter name

```js
async function userHasGrant({ user_id, collection_id, access_type }) {
  return grantService.userHasGrant({
    user_id,
    resource_type: 'COLLECTION',
    resource_id: collection_id,
    access_type,          // BUG: should be access_types (plural array)
  });
}
```
`grantService.userHasGrant` expects `access_types` (an array); passing `access_type` means the filter never activates.

---

### 12. access_requests.js — `submitReview` has a TOCTOU race

`validateReview` (status check + item ID match) runs **outside** the transaction, then the actual writes happen inside:

```js
validateReview(currentRequest, item_decisions);  // reads state outside tx
...
return prisma.$transaction(async (tx) => {       // state may have changed by now
```
Two concurrent review submissions can both pass validation and both proceed, potentially double-creating grants.

---

## Unhandled Edge Cases

### 13. access_requests.js — `PUT /:id`, `POST /:id/submit`, `POST /:id/withdraw` have no `authorize` middleware

Ownership is verified inside the service for `update` and `withdraw`, but the `submit` route doesn't even verify ownership—it just calls the service which checks `requester_id`. Consistent with the stated philosophy, authorization should be expressed at the route layer via `authorize(...)`, not buried in service logic.

---

### 14. groups.js `searchGroupsForUser` — `direct_membership_only` matches any user's membership

```sql
SELECT g.*, gu.role as user_role
FROM "group" g
LEFT JOIN group_user gu ON gu.group_id = g.id
WHERE gu.role IS NOT NULL             -- any non-null role, but gu.user_id is unconstrained
```
`gu.user_id = ${user_id}` is never added to the JOIN or WHERE. A group with any member having a role will pass the filter, regardless of whether the requesting user is that member.

---

### 15. access_requests.js — wrong values in `status` enum for `GET /requested-by-me`

```js
query('status').optional().isIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'])
```
`'SUBMITTED'` is not a real status (it's `'UNDER_REVIEW'`), and `'PARTIALLY_APPROVED'` is missing.

---

### 16. collections.js — `GET /:id/datasets` has no `max` cap on `limit`

```js
query('limit').default(100).isInt({ min: 1 }).toInt()   // no max
```
All other paginated endpoints set `max: 100`. This allows unbounded queries.

---

## Inconsistencies / Style Issues

### 17. `version` parameter location is inconsistent
- `PATCH /collections/:id` — `version` in **request body**
- `PATCH /groups/:id` — `version` in **query string**

Pick one (body is more correct for non-idempotent writes).

---

### 18. `search_term` is not `.optional()` in search routes

Both `POST /collections/search` and `POST /groups/search` validate:
```js
body('search_term').isString()
```
Without `.optional()`, sending `null` or omitting the field fails validation. The services handle `search_term = null` correctly; the validator should match.

---

### 19. Audit record `action` field has mixed casing

```js
action: 'create'    // groups.js service
action: 'CREATE'    // grants.js, access_requests.js
action: 'update'    // groups.js service
action: 'UPDATE'    // (implied)
```
Should be consistently one case across all services.

---

### 20. Stale comment in collections.js service

```js
// create audit record for group creation  ← wrong
await tx.authorization_audit.create({ event_type: AUTH_EVENT_TYPE.COLLECTION_CREATED ...
```

---

### 21. `createGroupChild` doc comment is copy-pasted from `createGroup`

The JSDoc for `createChildGroup` says `"Create a new group"` instead of `"Create a new child group"`.

---

### 22. `archiveGroup` / `unarchiveGroup` return type mismatch between docs and routes

Service docs say `@returns {Promise<void>}`, but routes do `res.json(req.permission.filter(result))` expecting a full group object back. Either the docs or the routes are wrong (and bug #9 makes this actually `undefined`).
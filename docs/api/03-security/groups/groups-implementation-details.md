---
title: Implementation Details
---


## 7. Implementation Details

### 7.1 Closure Table Maintenance

#### On Group Creation

* Insert `(groupId, groupId, depth = 0)`.

#### On Adding Parent

* Insert all `(ancestor(parent), descendant(child))` combinations.

These operations are transactional and occur rarely.

### 7.2 Read Path

Authorization check:

1. Fetch user group IDs.
2. Query closure table to see if any user group descends from dataset owner group.
3. Evaluate policy rules.

No recursion, no loops in application code.

### 7.3 ABAC Middleware

* Resolves user, resource, and context.
* Dispatches to the correct policy.
* Emits decision events.

### 7.4 Attribute‑Level Disclosure

Policies may return attribute filters for read actions:

* Public users: limited fields.
* Group admins: all fields except internal notes.

Filtering is applied after authorization.

---

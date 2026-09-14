---
title: Access Presets
order: 6
status: active
implemented: partial
last_verified: 2026-09-14
---

::: warning Design record — active
Design decisions behind grant presets, recorded March 2026. `grant_preset` and `grant_preset_item` exist in the schema; the reviewer and auditor experiences described here are not all built.
:::

# Access Preset Design

Design decisions and implementation notes — March 2026

---

## 1. Purpose

Access types are the atomic unit of permission in this system. Presets are named, curated bundles of access types that represent common, coherent patterns of access — the seeded *Standard Research Use* preset bundles the collection types for browsing a collection with `DATASET:VIEW_METADATA`, `DATASET:LIST_FILES`, and `DATASET:DOWNLOAD` for the datasets it holds. Presets exist to reduce cognitive load and input friction for the three actor types who initiate or grant access: group admins (preemptive granting), requesters (access requests), and platform admins (configuration).

Access types also carry a partial order, so a preset's bundle is usually smaller than its list. `DATASET:DOWNLOAD` satisfies every check for the other two dataset types in *Standard Research Use*, and `COLLECTION:LIST_CONTENTS` does the same for `COLLECTION:VIEW_METADATA`, so issuing that preset writes two grants rather than five. Section 2.10 covers what expansion does with the order. The worked examples in section 2.8 use letters for access types that are pairwise incomparable, because that is the case supersession has to resolve.

Presets are a convenience and a provenance mechanism. They are not an enforcement boundary. Individual grants remain the authorization primitive; presets only determine how grants are described and grouped.

---

## 2. Design Decisions

### 2.1 Presets are DB-modeled, not UI sugar

The initial framing was: expand presets in the UI, send individual `access_type_id` values to the API, and never persist the preset concept. This was rejected for three reasons:

- **Audit provenance is destroyed.** If six grants are created by a single preset selection with no shared provenance, a reviewer cannot reconstruct the original intent.
- **Partial revocation becomes inexplicable.** An admin revoking two of six preset-derived grants leaves a state that matches no known preset and has no explanation — a direct violation of the explainability invariant.
- **Reviewer coherence breaks.** A reviewer who approved "Standard Researcher Access" approved something named and intentional. A reviewer who approved a flat list of six access types approved an anonymous enumeration.

> **Decision:** Presets are stored in the database as lightweight, platform-seeded config. They are not lifecycle-managed entities — they do not version, do not have per-group variants (initially), and are not owned by any workflow object.

### 2.2 Presets as provenance anchors, not constraints

Presets do not constrain how grants may be revoked. An admin may revoke any individual grant regardless of whether it was created as part of a preset. The preset is a label for the original intent, not a contract about future state.

In role-based systems (AWS IAM managed policies, GitHub team permissions), removing a role atomically removes all permissions it conferred. That model enforces coherence but is opaque — the admin doesn't see which individual permissions are going away, and fine-grained exceptions are difficult to express. This system operates differently: grants are revoked individually, with full visibility into what is being removed and why. The comparison is a strength, not a tradeoff — finer control with clearer provenance.

> **Decision:** When an admin revokes a subset of grants that share a source preset, the UI surfaces this as a named partial state: *"This subject has partial access from 'Standard Researcher Access' — 4 of 6 access types remain."* The system explains the deviation rather than blocking it.

### 2.3 `access_request_item` is polymorphic

A request item represents one unit of user intent. That unit is either a preset or an individual access type — exactly as selected. Items are not expanded at submission time.

Expansion to individual grants happens at approval time, as a write-side concern. This preserves the semantic shape of the request through the entire review workflow.

| Actor | What they see |
|---|---|
| Requester | The presets and access types they selected — unchanged. |
| Reviewer | The same units of intent, grouped by preset where applicable. Approve/reject per item. |
| Auditor | The original request with preset names snapshotted at submission time. |

> **Decision:** `access_request_item` holds either `preset_id` or `access_type_id` — never both. This is enforced at the database layer with a CHECK constraint (see Section 4).

### 2.4 Grant provenance links to the request, not the item

The previous design linked each grant back to the `access_request_item` that produced it (1:1). Under the new model, a single preset item expands to multiple grants at approval time, breaking that 1:1 relationship.

The link is therefore promoted to the request level: each grant carries a `source_request_id`. Grants can always be traced to the request that authorized them, and from the request to the exact items that were approved.

> **Decision:** Grant provenance points to the request. `grant.source_access_request_id` is the link, and the request's items say what was approved.

**Reversed.** `grant.source_preset_id` exists and is populated on both paths. The original decision kept preset provenance off the grant, which left the Access tab unable to name the preset without a join the presentation layer never made — risk 5 in [Trust and communication](./trust-and-communication.md). A grant expanded from an approved preset item has both provenances, so it records both. An access type the request named directly, or that two presets both supply, records no preset.

### 2.5 Name snapshots at write time

`access_request_item` stores `source_preset_name` as a snapshot taken at submission time. This mirrors the existing pattern used throughout the `authorization_audit` table (`actor_name`, `target_name`) and ensures that renaming or retiring a preset does not corrupt historical records.

> **Decision:** Preset names are snapshotted at the item level. The live name in `grant_preset` is the source of truth for the UI; the snapshot is the source of truth for audit and explainability display.

**Not built.** `access_request_item` has no `source_preset_name` column. A preset is retired with `is_active` rather than deleted, so a historical request still resolves the name it referenced, which covers the same risk while presets stay platform configuration. Build the snapshot if anyone but a platform admin ever gains the ability to rename a preset.

### 2.6 Intra-preset partial approval is not supported

A reviewer approves or rejects a preset item as a unit. They cannot approve some access types within a preset and reject others in a single review action. If a reviewer wants to grant a subset of a preset's access types, they must reject the preset item and add individual `access_type` items explicitly.

This matches the behavior of all major IAM systems and keeps the reviewer workflow simple. It does not prevent fine-grained outcomes — it only requires explicit expression of them.

### 2.7 Access requests are workflow artifacts; only grants are revoked

`access_request` is an immutable record of a decision. Once a request reaches a terminal state (`APPROVED`, `REJECTED`, `WITHDRAWN`) it is never mutated again. There is no `REVOKED` state on a request, and revocation does not reopen or modify the request in any way.

This is by design. The request records *what was decided and when*. The grants record *what access currently exists*. These are independent axes and must not be conflated.

When an admin wants to revoke access that originated from a request — fully or partially — the operation is entirely on grants:

```sql
-- Find all active grants from a request
SELECT * FROM grant
WHERE source_request_id = 'X'
AND revoked_at IS NULL;
```

The admin then revokes whichever grants they choose. The request record is untouched and continues to accurately describe what was approved at the time of review.

This gives three natural revocation surfaces, all of which are pure grant operations:

- **By grant** — revoke a specific grant directly, regardless of origin
- **By request** — find all active grants from a request and revoke some or all
- **By subject and resource** — find all active grants a subject holds on a resource and revoke selectively

> **Decision:** `access_request` has no revoked state. Revocation is always an operation on grants. The request remains in its terminal approval state as a permanent record of the review decision.

#### Request status vs. grant status are independent

When all grants from a request have been revoked, the request still reads `APPROVED`. There is no derived status automatically applied to the request. The UI layer must query both the request and its associated grants to show the full picture — for example, *"Approved on 2026-01-15 — all grants subsequently revoked."*

This is intentional. The approval was real; it happened; it should remain visible. The revocations are equally real and visible on the grants. Collapsing both into a single status field on the request would obscure one or the other.

### 2.8 Overlapping grants are resolved by supersession, not rejection

The grant table carries an exclusion constraint: for the same `(subject_id, resource_id, access_type_id)` tuple, no two non-revoked grants may have overlapping validity intervals. This constraint exists to prevent ambiguous authorization state — when two grants overlap, it is unclear which governs, when access ends, and which should be revoked.

With presets, overlapping access types across requests become a natural and intended workflow. A user requesting preset 2 `(A, D)` a few days after being granted preset 1 `(A, B, C)` is not making an error — they are legitimately requesting a different bundle that happens to share access type A. Without a resolution strategy the constraint rejects the second request, forcing the user to reason about their existing grants and decompose their request manually. This leaks internal grant mechanics into the user-facing workflow.

#### Rejected alternatives

**Rejecting the second request outright.** Forces the user to manually decompose their preset into only the access types they don't already hold. The user should not need to know what grants currently exist in order to request access. Rejected.

**Chaining grants.** The new grant for access type A starts at the moment the existing grant expires. This creates a temporal dependency between two independently-issued grants: if the first grant is revoked early, the chained grant begins at a now-meaningless timestamp. Renewal and audit logic become fragile. Rejected.

**Making grants polymorphic (read-time resolution).** Grants hold either a `preset_id` or an `access_type_id`. Presets are expanded and deduplicated at authorization check time rather than at write time. This was explored in detail and rejected for three reasons: the exclusion constraint can no longer be enforced at the database level without triggering write-time expansion anyway; every authorization check becomes a join + expand + deduplicate operation on the hottest read path in the system; and mutating a preset's composition retroactively changes the effective access of every subject holding a grant for that preset, making preset config a live authorization event requiring governance treatment. Rejected.

#### Supersession — the adopted approach

When approval-time expansion produces a new grant for an access type that already has an active grant for the same subject and resource, the system compares validity windows before deciding what to do. There are two cases.

**Case 1 — new grant is longer: `new.valid_until > existing.valid_until`, or `new.valid_until IS NULL`**

The existing grant is **superseded**: its `valid_until` is set to `now()` and a new grant is written with the new validity. The exclusion constraint is satisfied because the old grant is closed before the new one is inserted. Both operations occur atomically within the approval transaction.

An indefinite new grant (`valid_until IS NULL`) always supersedes a finite existing grant, since no expiry is always more favorable than any expiry.

**Case 2 — new grant is shorter: `new.valid_until < existing.valid_until`, or `existing.valid_until IS NULL`**

The existing grant already confers this access type with a later expiry than what was just approved. Creating the new grant would strictly reduce the subject's access — which is not what approval means. Grant creation is skipped for this access type and the existing grant is left untouched.

This is not a silent no-op. Three things still happen:

- The `access_request_item` decision is recorded as `APPROVED` — the reviewer approved the request and that fact is immutable.
- The audit record notes that no grant was created because an existing grant with a later expiry already covers this access type, referencing the existing grant ID.
- The access explanation UI surfaces this: *"read_data approved on request #42 — already covered by grant #17 (expires Feb 2027)."*

Without these, an approved item with no corresponding new grant looks like a system error rather than an intentional skip.

Supersession is not revocation-for-cause. The `revocation_type` field on the grant distinguishes the two:

```
MANUAL     — admin decision to remove access
SUPERSEDED — closed early because a broader or longer grant replaced it
```

The Case 1 audit record reads: *"Grant #X for `read_data` on Resource R closed early — superseded by grant #Y created under request #Z."*

Example timeline — User U holds preset 1 `(A, B, C)` for 1 month, then three days later requests preset 2 `(A, D)` for 1 year:

```
grant A  valid_from: Jan 1   valid_until: Jan 4       revocation_type: SUPERSEDED  ← Case 1
grant A  valid_from: Jan 4   valid_until: Jan 4 + 1yr
grant B  valid_from: Jan 1   valid_until: Feb 1
grant C  valid_from: Jan 1   valid_until: Feb 1
grant D  valid_from: Jan 4   valid_until: Jan 4 + 1yr
```

Now suppose U then requests preset 3 `(A)` for 3 days on Jan 10 — a short-lived access type already covered by the 1-year grant:

```
grant A  valid_from: Jan 4   valid_until: Jan 4 + 1yr  ← untouched, Case 2 applies
                                                           item APPROVED, no new grant
```

The exclusion constraint is never violated. Authorization state is unambiguous at every point in time. The subject always holds the most favorable validity for each access type.

> **Decision:** When expansion produces a conflict, the system compares validity windows. If the new grant is longer or indefinite, the existing grant is superseded atomically and a new grant is created. If the new grant is shorter, grant creation is skipped, the item is still marked APPROVED, and the skip is recorded in the audit log referencing the covering grant.

#### What supersession does not cover

Supersession compares the incoming grant against grants held by the **exact same subject**.
`fetchExistingGrants` filters on `subject_id`, because that is the only thing a write may
close: a grant belongs to one subject, and approving a request for Alice cannot close a grant
her lab holds.

So the one-live-grant invariant holds along a single subject path and nowhere else. Alice may
hold `DOWNLOAD` personally and inherit `DOWNLOAD` from her lab, from an ancestor of that lab,
from a system principal, and from a collection holding the dataset. All five overlap, the
exclusion constraint never fires, and the authorization layer has always read the union.

This is intentional, and it is why the constraint stays rather than being dropped as the
2026-09-03 review proposed. [Decisions](./decisions.md) records the reasoning as decision 14.

What it costs is explanation, not correctness. A reviewer looking only at the exact-subject
comparison sees "a new grant will be created" for access the subject already has by another
path. `getEffectiveCoverage` answers the union question, and both the requester's and the
reviewer's preview now show it beside the grant that would be written. The coverage is
advisory: it names what already reaches the subject and closes nothing.

#### Concurrent approvals can collide

Two reviewers approving two requests for the same subject, resource, and access type inside
the same transaction window collide on the exclusion constraint. One approval is rejected, and
which validity window survives depends on which transaction commits first.
`issueGrants.concurrency.test.js` asserts exactly this shape.

Nothing retries. The losing reviewer sees a 409 and reviews again, which then succeeds,
because the winning grant is visible to `fetchExistingGrants` on the second attempt and the
approval becomes a Case 1 supersession or a Case 2 skip.

This is accepted rather than fixed. The window is the length of one approval transaction, the
failure is loud rather than silent, and the recovery is to review again. If it is ever
observed in practice, the fix is to retry the losing transaction.

### 2.9 Access explanation reconstructs the preset narrative from request lineage

With write-time expansion, the grant table contains only access types — no preset references. The concern is that this breaks the "illusion" of presets for users and admins viewing current access: the requester selected presets, the reviewer approved presets, but the access explanation shows a flat list of access types.

The preset narrative is not lost — it is derivable. For any active grant, `grant.source_request_id` leads to the originating `access_request`, whose `access_request_items` carry `preset_id` and `source_preset_name` snapshots. The full semantic picture can be reconstructed by grouping active grants by request and mapping them back to the items that produced them.

#### Rejected alternative: carrying preset provenance on the grant

Carrying `source_preset_id` and `source_preset_name` directly on the grant was considered, to make access explanation a direct read rather than a join. This was rejected because it conflates the authorization primitive with intent metadata. The grant table's job is to record what access exists and when it was authorized. Why it was authorized — the preset name, the requester's stated purpose, the reviewer's decision — belongs in the request record. Mixing these concerns into the grant table produces a table that does two jobs poorly rather than one job well.

#### Two distinct views

**Effective access view** — answers *"what can this subject do right now?"* A flat list of active grants, each labelled with its access type, validity, and the request that produced it. This is the authorization truth.

**Access narrative view** — answers *"how did this subject come to have this access?"* Groups active grants by request, displays preset names from the `source_preset_name` snapshot, and surfaces any superseded grants with their replacement. This is the explainability layer.

Both views are derivable from the same data. The difference is presentation, not data availability.

#### Preemptive admin grants

When a group admin grants access preemptively (outside the request workflow), there is no `access_request` and no `access_request_item`. The grant has no request lineage. In this case the explanation is the flat access type list with the granting admin as the actor. If preset provenance is also desired on preemptive grants, `source_preset_id` and `source_preset_name` can be carried optionally on the grant for this path only — a narrow addition that does not affect the request workflow.

> **Decision:** Preset provenance for request-derived grants is reconstructed at display time from request lineage, not stored redundantly on the grant. The grant table records authorization facts; the request table records intent. These are read together by the presentation layer.

### 2.10 Expansion reduces a preset through the access-type order

Access types carry a partial order, held in `grant_access_type_implication`. Holding a wider type satisfies a check for a narrower one, so `DATASET:DOWNLOAD` satisfies `DATASET:LIST_FILES`, which satisfies `DATASET:VIEW_METADATA`. A preset that lists all three describes one fact, and writing three rows records it three times.

Approval-time expansion therefore reduces the access type set to its maximal elements before anything is written. *Standard Research Use* writes one grant of `DATASET:DOWNLOAD` and one of `COLLECTION:LIST_CONTENTS`. Both seeded presets reduce: nine listed access types become four grants.

Reduction is a property of the access types, not of presets. Two access types named directly in one request collapse the same way.

**A wider type only absorbs a narrower one when it lasts at least as long.** Approving a month of `DOWNLOAD` beside a year of `VIEW_METADATA` writes both rows, because dropping the year would end metadata access eleven months early. This is the same comparison supersession makes, applied before the write rather than against an existing grant.

**A wider grant the subject already holds skips the write.** Section 2.8 compares an incoming grant against an existing grant of the *same* access type, because that is the only grant a write may close. A live grant of a wider type is read too, and it produces the Case 2 skip: the item is approved, no row is written, and the audit record names the covering grant. It is never superseded — closing a `DOWNLOAD` grant in order to write a `LIST_FILES` grant would narrow the subject's access, which approving a request must never do.

> **Decision:** Expansion reduces to the maximal access types under the order, subject to expiry. A wider grant already held skips the write and is never closed by a narrower one.

@see [decision 7](./decisions.md#_7-access-types-imply-one-another) and the [Access type order plan](./access-type-order-plan.md).

### 2.11 Presets are scoped to collections

Every seeded preset applies to a collection, and none applies to a dataset. A preset earns its place by pairing access types the order does not connect.

The order has no edge between a `COLLECTION:*` type and a `DATASET:*` type. `COLLECTION:LIST_CONTENTS` lets a subject browse a collection and open none of its datasets. `DATASET:DOWNLOAD` issued on the collection opens its datasets and not the collection itself. A collection preset pairs the two, so a requester does not have to know that both are needed.

A dataset has no such pair. Every dataset bundle reduces through the order to one access type. A dataset copy of *Standard Research Use* wrote one `DATASET:DOWNLOAD` grant, and a dataset copy of *Discoverable* wrote one `DATASET:REQUEST_ACCESS` grant. A preset that names one access type only gives it a second name. The request form and the issue dialog therefore offer a dataset its access types directly, and they omit the preset block when no preset applies.

`grant_preset.resource_types` stays. It is the check that refuses a collection preset on a dataset.

A preset removed from `GRANT_PRESETS` is retired, never deleted. The seed sets `is_active` to false on every preset the constant no longer lists. Grants and request items reference a preset with `ON DELETE RESTRICT`, so deleting one would fail on any history. Approving a request that names a retired preset is refused with a 400. Expanding a retired preset to nothing would mark the item approved and write no grant.

> **Decision:** Presets are scoped to collections. A preset dropped from the seed is retired, and an approval that names it is refused.

---

## 3. Data Model

### 3.1 New models

#### `grant_preset`

```prisma
model grant_preset {
  id          Int     @id @default(autoincrement())
  name        String  @unique   // "Standard Researcher Access"
  slug        String  @unique   // "standard_researcher"
  description String?
  is_active   Boolean @default(true)  // soft-disable; never hard-delete

  access_type_items    grant_preset_item[]
  access_request_items access_request_item[]
}
```

#### `grant_preset_item`

```prisma
model grant_preset_item {
  preset_id      Int
  access_type_id Int

  preset      grant_preset      @relation(fields: [preset_id],
                                  references: [id], onDelete: Cascade)
  access_type grant_access_type @relation(fields: [access_type_id],
                                  references: [id], onDelete: Restrict)

  @@id([preset_id, access_type_id])
}
```

### 3.2 Modified models

#### `access_request_item` — polymorphic item

```prisma
model access_request_item {
  id                String @id @default(uuid())
  access_request_id String

  // Exactly one of these is set — enforced by DB CHECK constraint
  preset_id          Int?    // references grant_preset
  access_type_id     Int?    // references grant_access_type

  // Snapshot of preset name at submission time
  source_preset_name String?

  requested_until DateTime?
  decision        ACCESS_REQUEST_ITEM_DECISION @default(PENDING)

  access_request access_request     @relation(...)
  preset         grant_preset?      @relation(...)
  access_type    grant_access_type? @relation(...)

  @@unique([access_request_id, preset_id])
  @@unique([access_request_id, access_type_id])
}
```

#### `grant` — request-level provenance and supersession

```prisma
model grant {
  // ... existing fields unchanged ...

  source_request_id String?
  source_request    access_request? @relation(...)

  // Populated when this grant was closed early by a superseding grant
  revocation_type GRANT_REVOCATION_TYPE?
}

enum GRANT_REVOCATION_TYPE {
  MANUAL      // admin decision to remove access
  SUPERSEDED  // closed early because a broader or longer grant replaced it
}
```

#### `access_request` — back-relation to grants

```prisma
model access_request {
  // ... existing fields unchanged ...
  grants grant[]
}
```

---

## 4. Database Constraints

### 4.1 Mutual exclusivity on `access_request_item` — CHECK constraint

Exactly one of `preset_id` or `access_type_id` must be non-null on each `access_request_item`. Enforced at the database layer, not only the application layer.

```sql
ALTER TABLE access_request_item
  ADD CONSTRAINT chk_item_exactly_one_type CHECK (
    (preset_id IS NOT NULL AND access_type_id IS NULL)
    OR
    (preset_id IS NULL AND access_type_id IS NOT NULL)
  );
```

Add this in the migration SQL file directly — Prisma does not have native syntax for CHECK constraints.

### 4.2 Deduplication — UNIQUE constraints

The two unique constraints on `access_request_item` prevent duplicate preset or access type selections within the same request:

- `@@unique([access_request_id, preset_id])` — a preset may not appear twice in one request
- `@@unique([access_request_id, access_type_id])` — an access type may not appear twice in one request

These operate independently. A preset item and an individual access type item may coexist in the same request even if the access type is also included inside the preset — deduplication of the expanded set is handled at approval-time grant creation, not at submission time.

### 4.3 Non-overlapping grants — exclusion constraint

The exclusion constraint on `grant` remains unchanged:

```sql
-- Existing constraint — defined in migration SQL.
-- For the same (subject_id, resource_id, access_type_id) tuple,
-- no two non-revoked grants may have overlapping validity intervals.
EXCLUDE USING gist (
  subject_id     WITH =,
  resource_id    WITH =,
  access_type_id WITH =,
  valid_period   WITH &&
) WHERE (revoked_at IS NULL);
```

Supersession (see Section 5) ensures this constraint is never violated when new grants are created from overlapping presets. The constraint remains the enforcement mechanism; supersession is what keeps the system compliant with it.

### 4.4 Referential integrity on `grant_preset_item`

`grant_preset_item` uses `onDelete: Restrict` toward `grant_access_type`. An access type that is part of a preset definition cannot be deleted. This protects preset config coherence at the definition level.

---

## 5. Approval-time Expansion

When a reviewer approves one or more `access_request_item`s and submits the review, the API performs the following steps **within a single transaction**:

1. Collect all approved items for the request.
2. For each item where `preset_id` is set, expand to the access types defined in `grant_preset_item`.
3. For each item where `access_type_id` is set, use that access type directly.
4. Deduplicate the combined set of access types. A type appearing in multiple presets, or in a preset and as an individual item, is reduced to a single entry. The longest `requested_until` among the contributing items wins (`NULL` beats any finite value).
5. For each access type in the deduplicated set, check for an existing active grant on the same `(subject_id, resource_id, access_type_id)` tuple.
6. Apply the supersession decision:

```
if existing active grant found:
  if new.valid_until IS NULL
     or (existing.valid_until IS NOT NULL
         and new.valid_until > existing.valid_until):
    → Case 1: set existing.valid_until = now(),
              existing.revocation_type = SUPERSEDED,
              create new grant,
              emit grant.superseded audit event
  else:
    → Case 2: skip grant creation,
              emit grant.skipped audit event referencing existing grant ID,
              mark access_request_item APPROVED with no created_grant_id
else:
  → create new grant normally
```

7. All supersessions and insertions execute within the same transaction. The exclusion constraint is satisfied at commit time because superseded grants are closed before new ones are inserted.

> **Note:** The API never expands items at submission time. Expansion and supersession are exclusively write-side concerns that occur once: at the moment grants are created.

---

## 6. Explicitly Out of Scope

The following were considered and deferred. They require no schema changes to add later.

| Feature | Rationale for deferral |
|---|---|
| Preset versioning | Name snapshot on `access_request_item` is sufficient for historical records. No approval workflow references a preset version. |
| Per-group preset customization | All current presets are platform-wide. `owner_group_id` can be added to `grant_preset` as a one-column migration when needed. |
| Preset-level approval workflow | Approval is per `access_request_item`. Presets do not add a separate approval layer. |
| Atomic preset revocation | Grants are revoked individually. The system explains partial states rather than preventing them. |
| `source_preset_id` on preemptive grants | Preemptive grants explain access via the flat access type list and the granting admin. Preset provenance can be added as optional fields on `grant` for this path if needed. |
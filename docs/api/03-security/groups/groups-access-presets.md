# Access Preset Design

Design decisions and implementation notes — March 2026

---

## 1. Purpose

Access types are the atomic unit of permission in this system. Presets are named, curated bundles of access types that represent common, coherent patterns of access — for example, a *Standard Researcher* preset might bundle `read_data`, `browse_metadata`, and `stage_data` together. Presets exist to reduce cognitive load and input friction for the three actor types who initiate or grant access: group admins (preemptive granting), requesters (access requests), and platform admins (configuration).

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

> **Decision:** Grants do not carry a `source_preset_id` or `source_preset_name`. Preset provenance lives on `access_request_item`, where it was expressed. Grant provenance points to the request.

### 2.5 Name snapshots at write time

`access_request_item` stores `source_preset_name` as a snapshot taken at submission time. This mirrors the existing pattern used throughout the `authorization_audit` table (`actor_name`, `target_name`) and ensures that renaming or retiring a preset does not corrupt historical records.

> **Decision:** Preset names are snapshotted at the item level. The live name in `grant_preset` is the source of truth for the UI; the snapshot is the source of truth for audit and explainability display.

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
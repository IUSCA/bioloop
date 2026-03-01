## Grant Presets Schema Design

### Design Question Answer First

**Track presets in the request, but display atomic grants.**

Here's the reasoning:

- **Presets are ephemeral intent signals**, not authorization primitives. Authorization evaluation ignores them entirely.
- However, **UX context matters for reviewers**: "User requested `OWNING_GROUP:DOWNLOADABLE`" is more meaningful than seeing 3 atomic items with no shared context.
- The right model is: store the preset as **provenance metadata** on the request (or a request item group), while the `access_request_item` rows remain atomic.
- This gives you: reviewers can see *"these 3 items came from preset X"* without coupling authorization logic to presets.

The key invariant: **preset identity is stored for display/audit purposes only — approval/rejection always operates on atomic items**.

---

### Schema

````prisma
// ...existing code...

// ============================================================================
// GRANT PRESETS - Convenience layer over atomic grants (display/UX only)
// ============================================================================

// Defines available access presets (what actions) - e.g. DISCOVERABLE, DOWNLOADABLE
// These are configuration records, not authorization primitives.
model grant_access_preset {
  id          Int     @id @default(autoincrement())
  name        String  @unique  // e.g. "DISCOVERABLE", "DOWNLOADABLE", "READABLE"
  description String?
  is_active   Boolean @default(true)

  // Ordered list of access types this preset expands into
  // Stored via join table to preserve ordering and allow reuse
  access_type_members grant_access_preset_member[]

  // Track which request item groups used this preset (for display/audit)
  request_item_groups access_request_item_group[]

  created_at DateTime @default(now()) @db.Timestamp(6)
  updated_at DateTime @default(now()) @updatedAt @db.Timestamp(6)
}

// Which access types are included in each access preset, with ordering
model grant_access_preset_member {
  preset_id      Int
  access_type_id Int
  sort_order     Int @default(0) // Controls display ordering

  preset      grant_access_preset @relation(fields: [preset_id], references: [id], onDelete: Cascade)
  access_type grant_access_type   @relation(fields: [access_type_id], references: [id], onDelete: Cascade)

  @@id([preset_id, access_type_id])
  @@index([preset_id])
}

// Defines visibility presets (who receives access)
// These resolve to concrete subjects based on resource topology at application time.
model grant_visibility_preset {
  id          Int     @id @default(autoincrement())
  name        String  @unique // e.g. "EVERYONE", "OWNING_GROUP", "INSTITUTION", "PARENT_GROUP"
  description String?
  is_active   Boolean @default(true)

  // How the subject is resolved - drives application logic
  resolution_strategy VISIBILITY_PRESET_RESOLUTION_STRATEGY

  // Track which request item groups used this preset (for display/audit)
  request_item_groups access_request_item_group[]

  created_at DateTime @default(now()) @db.Timestamp(6)
  updated_at DateTime @default(now()) @updatedAt @db.Timestamp(6)
}

enum VISIBILITY_PRESET_RESOLUTION_STRATEGY {
  EVERYONE         // Resolves to the system "Everyone" principal
  OWNING_GROUP     // Resolves to resource.ownerGroupId
  INSTITUTION      // Resolves to root group of the owning group's hierarchy
  PARENT_GROUP     // Resolves to immediate parent of owning group
  EXPLICIT_GROUP   // Named group (stored in the request item group's resolved_subject_id)
}

// ============================================================================
// ACCESS REQUEST ITEM GROUP
// Groups atomic access_request_items that originated from a single preset
// application. This is purely a display/audit aid - authorization logic
// continues to operate on individual access_request_item rows.
// ============================================================================

model access_request_item_group {
  id                String @id @default(uuid())
  access_request_id String

  // Optional preset provenance (null = items were specified atomically by user)
  access_preset_id    Int?
  visibility_preset_id Int?

  // Resolved subject at time of request submission.
  // Stored here so reviewers see who will receive access, even if topology changes.
  resolved_subject_type GRANT_SUBJECT_TYPE
  resolved_subject_id   String // user.id or group.id

  // Display label - e.g. "OWNING_GROUP:DOWNLOADABLE" or "Custom"
  display_label String?

  // Preset was applied at this timestamp (for audit trail)
  applied_at DateTime @default(now()) @db.Timestamp(6)

  // Relations
  access_request   access_request       @relation(fields: [access_request_id], references: [id], onDelete: Cascade)
  access_preset    grant_access_preset? @relation(fields: [access_preset_id], references: [id], onDelete: SetNull)
  visibility_preset grant_visibility_preset? @relation(fields: [visibility_preset_id], references: [id], onDelete: SetNull)
  items            access_request_item[]

  @@index([access_request_id])
}

// ...existing code...

// Modify access_request_item to link back to item group (optional - null = no preset context)
model access_request_item {
  id                String                       @id @default(uuid())
  access_request_id String
  access_type_id    Int
  requested_until   DateTime?
  decision          ACCESS_REQUEST_ITEM_DECISION @default(PENDING)
  created_grant_id  String?

  // Optional: which preset group spawned this item (null = standalone atomic request)
  item_group_id String?

  access_request access_request             @relation(fields: [access_request_id], references: [id], onDelete: Cascade)
  access_type    grant_access_type          @relation(fields: [access_type_id], references: [id], onDelete: Cascade)
  created_grant  grant?                     @relation(fields: [created_grant_id], references: [id], onDelete: SetNull)
  item_group     access_request_item_group? @relation(fields: [item_group_id], references: [id], onDelete: SetNull)

  @@index([item_group_id])
}

// ...existing code...

// Add back-relation to grant_access_type for preset membership
// (add this relation inside grant_access_type model)
model grant_access_type {
  id            Int                 @id @default(autoincrement())
  name          String              @unique
  description   String?
  resource_type GRANT_RESOURCE_TYPE

  grants             grant[]
  accessRequestItems access_request_item[]
  preset_memberships grant_access_preset_member[] // new
}

// ...existing code...
````

---

### Data Flow: Preset → Request → Grants

```
User selects "OWNING_GROUP:DOWNLOADABLE"
        │
        ▼
access_request_item_group created
  ├── access_preset_id    → grant_access_preset("DOWNLOADABLE")
  ├── visibility_preset_id → grant_visibility_preset("OWNING_GROUP")
  ├── resolved_subject_id  → group.id (resolved NOW, frozen)
  └── display_label        → "OWNING_GROUP:DOWNLOADABLE"
        │
        ▼
3x access_request_item rows created (all linked to item_group_id)
  ├── item[VIEW_METADATA]   decision=PENDING
  ├── item[READ_DATA]       decision=PENDING
  └── item[DOWNLOAD]        decision=PENDING
```

**Reviewer sees**: "Request via preset `OWNING_GROUP:DOWNLOADABLE` → 3 access types for group `Synthesis Lab`"  
**Reviewer approves/rejects**: Individual items (can approve `VIEW_METADATA` + `READ_DATA` but reject `DOWNLOAD`)  
**Authorization evaluates**: Only the atomic grants created from approved items

---

### Key Design Decisions

| Decision | Rationale |
|---|---|
| `resolved_subject_id` frozen at submission time | Topology may change between request and review; reviewer must see what will actually be granted |
| Preset records are DB rows, not code enums | Organizations can define custom presets without deployment; presets can be deactivated |
| `item_group_id` is nullable on items | Supports atomic requests (no preset) and preset-based requests uniformly |
| Partial approval works naturally | Reviewer approves item-by-item; item group is display-only and has no effect on grant creation |
| `grant` model unchanged | Authorization layer is completely unaware of presets — the invariant holds |
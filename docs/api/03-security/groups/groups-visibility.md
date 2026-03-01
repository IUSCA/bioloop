User: Metadata ≠ Data

There are three separate visibility layers:
- Existence (can I see that this resource exists?)
- Metadata (can I see description, tags, owners?)
- Content (can I read/download/modify?)

Never conflate these.

Most systems fail because they treat “read” as a single thing.


based on user -> not a group member, group member, group admin, the grants they have and accesses attached to these grant should control what set of attributes they should see, if they are allowed to see at all.


For each model: group, dataset, collection - list attribute sets for each visibility levels

GitHub Copilot: # Visibility Layer Model: Attribute Sets by Actor and Resource

---

## Foundational Principle

Three orthogonal visibility layers:

| Layer | Question | Mechanism |
|---|---|---|
| **Existence** | Can I know this resource exists? | Grants, group membership, hierarchy |
| **Metadata** | Can I see descriptive attributes? | Grants (`view_metadata`, `view_sensitive_metadata`) |
| **Content** | Can I read/download/modify? | Grants (`read_data`, `download`, `compute`) |

**Never conflate.** A user may know a dataset exists, be forbidden from seeing its metadata, and separately be forbidden from reading its content.

---

## Actor Taxonomy

| Actor | Definition |
|---|---|
| `platform_admin` | System-wide administrator |
| `owner_group_admin` | Admin of the dataset/collection's owning group |
| `ancestor_group_admin` | Admin of an ancestor of the owning group (oversight only) |
| `owner_group_member` | Member of the owning group (directly or transitively) |
| `granted_user` | No group relation; has explicit grants to the resource |
| `anonymous` | Authenticated but no relation to resource |

---

## 1. Group

### Visibility Levels

#### Existence

> Can I know this group exists?

| Actor | Can See? | Basis |
|---|---|---|
| `platform_admin` | ✅ | Platform authority |
| `owner_group_admin` (self) | ✅ | Local admin |
| `ancestor_group_admin` | ✅ | Oversight (closure table) |
| `owner_group_member` | ✅ | Membership |
| `granted_user` | ❌ | Groups are not grant targets for visibility |
| `anonymous` | ❌ | No relationship |

---

#### Metadata (Can I see descriptive attributes?)

**Level 1 – Public Metadata**

Visible to anyone who can see the group exists.

| Attribute | Rationale |
|---|---|
| `id` | Required for relationship resolution |
| `name` | Display identity |
| `slug` | URL-safe identifier |
| `description` | Non-sensitive organizational context |
| `is_archived` | Governance signal |

---

**Level 2 – Member Metadata**

Visible to members and above.

| Attribute | Rationale |
|---|---|
| _All Level 1_ | |
| `created_at` | Temporal context |
| `allow_user_contributions` | Relevant to member workflows |
| `metadata` (non-sensitive fields) | Operational context |

---

**Level 3 – Admin / Oversight Metadata**

Visible to `owner_group_admin` and `ancestor_group_admin` (oversight).

| Attribute | Rationale |
|---|---|
| _All Level 2_ | |
| `updated_at` | Governance audit context |
| `archived_at` | Governance lifecycle |
| `version` | Optimistic concurrency (admin ops) |
| `metadata` (all fields) | Full operational context |
| `members[]` | Membership roster |
| `ancestor_edges[]` | Hierarchy position |
| `descendant_edges[]` | Subtree shape |
| `owned_datasets[]` (refs) | Resource inventory |
| `owned_collections[]` (refs) | Resource inventory |

---

**Level 4 – Platform Admin Only**

| Attribute | Rationale |
|---|---|
| _All Level 3_ | |
| `grants_as_subject[]` | Full grant inspection |
| Internal audit metadata | System-level observability |

---

### Group: Attribute Set Summary

| Attribute | anonymous | granted_user | member | ancestor_admin (oversight) | owner_admin | platform_admin |
|---|---|---|---|---|---|---|
| `id` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `name` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `slug` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `description` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `is_archived` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `created_at` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `allow_user_contributions` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `metadata` (public fields) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `updated_at` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `archived_at` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `version` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `metadata` (all fields) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `members[]` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `ancestor_edges[]` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `descendant_edges[]` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `owned_datasets[]` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `owned_collections[]` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `grants_as_subject[]` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 2. Dataset

### Existence Layer

A user can know a dataset exists if **any** of:

* They are a member of the owning group (or ancestor group)
* They have **any** active grant to the dataset
* They have **any** active grant to a collection containing the dataset
* The dataset has a grant to `Everyone` for any action (public or discoverable)

| Actor | Can See? | Basis |
|---|---|---|
| `platform_admin` | ✅ | Platform authority |
| `owner_group_admin` | ✅ | Governance authority |
| `ancestor_group_admin` | ✅ | Oversight |
| `owner_group_member` | ✅ | Membership |
| `granted_user` | ✅ | Any active grant |
| `anonymous` (no grant, no membership) | ❌ | No relationship |
| `anonymous` (dataset is PUBLIC/DISCOVERABLE) | ✅ | `Everyone` grant exists |

---

### Metadata Layers

#### Level 1 – Existence Metadata

Visible to anyone who can see the dataset exists.

These reveal only the fact that the resource exists and its locator — **not** its operational or scientific content.

| Attribute | Rationale |
|---|---|
| `id` | Required for reference |
| `name` | Display identity |
| `type` | Classification |
| `is_deleted` | Lifecycle signal |

---

#### Level 2 – Descriptive Metadata  
Requires: `Grant(view_metadata)` OR owning group membership OR ancestry

| Attribute | Rationale |
|---|---|
| _All Level 1_ | |
| `description` | Scientific/operational context |
| `created_at` | Temporal context |
| `metadata` (public fields) | Non-sensitive annotations |
| `src_instrument_id` | Provenance |

---

#### Level 3 – Sensitive / Operational Metadata  
Requires: `Grant(view_sensitive_metadata)` OR owning group membership OR ancestry

| Attribute | Rationale |
|---|---|
| _All Level 2_ | |
| `num_files` | Volume information |
| `num_directories` | Structure information |
| `du_size` / `size` / `bundle_size` | Storage cost context |
| `origin_path` | Source provenance — potentially sensitive |
| `archive_path` | Infrastructure detail |
| `staged_path` | Infrastructure detail |
| `is_staged` | Operational state |
| `metadata` (all fields) | Full annotation set |
| `owner_group_id` / `owner_group` | Governance context |
| `updated_at` | Operational audit |

---

#### Level 4 – Admin / Governance Metadata  
Requires: admin of owning group OR `ancestor_group_admin` (oversight) OR `platform_admin`

| Attribute | Rationale |
|---|---|
| _All Level 3_ | |
| `version` | Concurrency control (admin ops) |
| `workflows[]` | Processing history |
| `audit_logs[]` | Full audit trail |
| `states[]` | State machine history |
| `stage_requests[]` | Operational history |
| `accesses[]` | Access logs — high sensitivity |
| `source_datasets[]` / `derived_datasets[]` | Lineage graph |
| `grants[]` | Full grant set on this dataset |
| `access_requests[]` | Pending requests |
| `collections[]` | Collection membership |
| `bundle` | Archival detail |

---

### Content Layer

Entirely grant-based. Never inferred from metadata access.

| Action | Required Grant | Notes |
|---|---|---|
| `read_data` | `Grant(read_data)` to dataset OR collection | Includes owning group members |
| `download` | `Grant(download)` explicitly | Separate from read |
| `compute` | `Grant(compute)` explicitly | Separate from read |

**Note:** Owning group membership satisfies `read_data` per design. All other content actions require explicit grants.

---

### Dataset: Attribute Set Summary

| Attribute | anonymous (no grant) | `view_metadata` grant | `view_sensitive_metadata` grant | owner_group_member | ancestor_admin (oversight) | owner_group_admin | platform_admin |
|---|---|---|---|---|---|---|---|
| `id` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `name` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `type` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `is_deleted` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `description` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `created_at` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `metadata` (public) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `src_instrument_id` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `num_files` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `num_directories` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `du_size` / `size` / `bundle_size` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `origin_path` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `archive_path` / `staged_path` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `is_staged` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `owner_group_id` / `owner_group` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `updated_at` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `metadata` (all) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `version` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `workflows[]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `audit_logs[]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `states[]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `stage_requests[]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `accesses[]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `grants[]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `access_requests[]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `collections[]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `source_datasets[]` / `derived_datasets[]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `bundle` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `files[]` (content) | ❌ | ❌ | ❌ | ✅ (read_data) | ✅ | ✅ | ✅ |

---

## 3. Collection

### Existence Layer

A user can know a collection exists if **any** of:

* They are a member of the owning group (or ancestor)
* They have any active grant to the collection
* They have any grant to a dataset that belongs to this collection (indirect — they know the collection exists from dataset grants)
* The collection has an `Everyone` grant

---

### Metadata Layers

#### Level 1 – Existence Metadata

| Attribute | Rationale |
|---|---|
| `id` | Reference |
| `name` | Display identity |
| `slug` | URL-safe locator |
| `is_archived` | Lifecycle signal |

---

#### Level 2 – Descriptive Metadata  
Requires: `Grant(collection.view_metadata)` OR owning group membership

| Attribute | Rationale |
|---|---|
| _All Level 1_ | |
| `description` | Purpose and scope |
| `created_at` | Temporal context |
| `metadata` (public fields) | Non-sensitive annotations |
| `owner_group_id` / `owner_group` | Governance attribution |

---

#### Level 3 – Operational Metadata  
Requires: owning group membership OR owner/ancestor admin

| Attribute | Rationale |
|---|---|
| _All Level 2_ | |
| `updated_at` | Operational context |
| `metadata` (all fields) | Full annotation set |
| `datasets[]` (refs — not content) | Collection inventory |

---

#### Level 4 – Admin / Governance Metadata  
Requires: `owner_group_admin` OR `ancestor_group_admin` (oversight) OR `platform_admin`

| Attribute | Rationale |
|---|---|
| _All Level 3_ | |
| `version` | Concurrency (admin ops) |
| `grants[]` | Who has access to this collection |
| `access_requests[]` | Pending access requests |

---

### Content Layer

Collection content access = access to member datasets.

Evaluated per-dataset using dataset content rules. Collection grants propagate down to datasets per authorization path (Section 9.3A of design doc).

---

### Collection: Attribute Set Summary

| Attribute | anonymous (no grant) | `view_metadata` grant | owner_group_member | ancestor_admin (oversight) | owner_group_admin | platform_admin |
|---|---|---|---|---|---|---|
| `id` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `name` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `slug` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `is_archived` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `description` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `created_at` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `metadata` (public) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `owner_group_id` / `owner_group` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `updated_at` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `metadata` (all) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `datasets[]` (refs) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `version` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `grants[]` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `access_requests[]` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## Cross-Cutting Rules

### Rule 1: Layer Independence

```
canSeeContent(user, dataset) ≠ canSeeMetadata(user, dataset)
canSeeMetadata(user, dataset) ≠ canSeeExistence(user, dataset)
```

Each layer is evaluated independently. Passing a lower layer does **not** imply passing a higher one.

---

### Rule 2: Grant Specificity

A `Grant(view_metadata)` does **not** imply `Grant(view_sensitive_metadata)`.  
A `Grant(read_data)` does **not** imply `Grant(download)`.  
A `Grant(collection.view_metadata)` does **not** propagate to dataset metadata.

---

### Rule 3: Membership Conveys Operational Visibility

Owner group members receive levels 1–3 metadata (descriptive + sensitive) and `read_data` content access by default. This reflects the design invariant: members of the owning group have operational access to their group's resources.

---

### Rule 4: Oversight is Read-Only and Additive

`ancestor_group_admin` oversight grants visibility into levels 1–4 metadata but **zero content access** and **zero governance authority** on resources they don't own.

---

### Rule 5: No Implicit Escalation

No path through the model allows content access to imply governance access, or metadata access to imply content access.
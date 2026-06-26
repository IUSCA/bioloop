# Spec: GrantsBySubjectPanel

**Component:** `GrantsBySubjectPanel`  
**Location:** `ui/src/components/v2/grants/GrantsBySubjectPanel.vue`  
**Context:** Used inside per-resource tabs (e.g., `CollectionGrantsTab`). The resource is established by the parent — this component does not identify or describe the resource.  
**Audience:** Administrators and data stewards managing access on a specific resource.

> **Coding Standards:** [UI Coding Standards](../../../docs/ui/coding_standards.md). Use Tailwind CSS, dark mode variants, `border-solid`, and existing utility components.

---

## Part 1 — What This Component Does

### 1.1 Mission

This component answers two questions for every subject that holds access on a resource:

1. **What can this subject do right now?** *(Effective access view)*
2. **How did they come to have this access?** *(Access narrative view)*

These are two lenses on the same underlying data — not two separate data sources. Explainability is a hard requirement, not a feature.

### 1.2 Two States Per Card

Each subject is represented as a card with two states:

**Collapsed (default):** Shows who the subject is, a quick summary of what access types they currently hold, and urgency signals (expiry warnings). Enough to audit the access roster at a glance without expanding anything.

**Expanded:** Shows full per-grant detail — what was granted, when, by whom, under whose authority, via which path, how long it lasts, and the revocation record if applicable. Every grant must be explainable to an auditor without referring to any other system.

### 1.3 Explainability Invariants

These are non-negotiable constraints that shape every design decision:

1. **Revoked grants are not erased.** If the caller passes a revoked grant, the component renders it — dimmed, annotated with revocation metadata. An empty revocation record would look like a system error to an auditor.

2. **Partial preset state is named, not silently normalized.** If a subject holds 3 of 6 access types from a named preset, the UI must say "partial access from 'Standard Researcher'" — not just list anonymous grants.

3. **Group grants explain their scope.** A grant to a group applies to all effective members transitively via group hierarchy. The card body surfaces this explicitly.

4. **Collection-based grants are distinct from direct grants.** A grant on a collection that fans out to a dataset must identify itself as a collection grant, not a direct grant. This distinction matters for governance — revoking the collection grant affects all datasets in it.

5. **Provenance is always present.** Every grant row shows: who granted it, when, under whose authority, and via which mechanism. "Unknown" is acceptable; blank is not.

### 1.4 What This Component Does NOT Do

- It does not infer effective access from membership or structural relationships. It renders only what is present in the grants data.
- It does not enumerate individual users within a group grant. The group is the subject; the membership is a structural fact stated once.
- It does not fetch the page-level resource. The resource context is owned by the parent page.
- It does not confirm revocation. The parent component handles the revoke flow and refetch.

---

## Part 2 — Data Model and API Analysis

### 2.1 Data Sources

The component uses three API endpoints across two loading phases:

| Phase | Source | Endpoint | When Called |
|---|---|---|---|
| Initial render | Collapsed data | `GET /grants/resource/:type/:id` | By parent (`CollectionGrantsTab`); passed as prop |
| On expand | Expanded data | `GET /grants/:subject_type/:subject_id/:resource_type/:resource_id` | Lazily on first card expansion |
| Once on mount | Access type catalog | `GET /grants/access-types` | Once per parent; passed as prop |

### 2.2 Collapsed Data Shape

The parent passes one item from the grouped resource response:

```typescript
type SubjectGrantGroup = {
  subject: Subject;
  grants: CollapsedGrant[];
};

type Subject = {
  id: string;
  type: "USER" | "GROUP";
  user: UserSummary | null;
  group: GroupSummary | null;
};

type UserSummary = {
  id: string;
  name: string;
  username: string;
  email: string;
};

type GroupSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_archived: boolean;
};

// Minimal fields returned by listGrantsForResourceGrouped SQL (post-processed)
type CollapsedGrant = {
  id: string;
  access_type_id: number;
  creation_type: "ACCESS_REQUEST" | "MANUAL" | "SYSTEM_BOOTSTRAP";
  source_preset_id: number | null;
  valid_from: string;    // ISO 8601
  valid_until: string | null;
  revoked_at: string | null;
  // Post-processed by API from valid_until — same shape as expanded grants
  expiry: { type: 'never'; value: null } | { type: 'date'; value: string };
};
```

### 2.3 Expanded Data Shape

Fetched on first card expansion from `GET /grants/:subject_type/:subject_id/:resource_type/:resource_id`. The API uses `GRANT_INCLUDES` which hydrates `resource`, `subject`, `access_type`, `grantor`, and `revoker`.

```typescript
type ExpandedGrant = {
  id: string;
  access_type_id: number;
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  revocation_type: "MANUAL" | "SUPERSEDED" | null;
  creation_type: "ACCESS_REQUEST" | "MANUAL" | "SYSTEM_BOOTSTRAP";
  justification: string | null;
  created_at: string;

  // Prisma computed field (db.js extension). Serialized as { type: 'never', value: null }
  // or { type: 'date', value: '<ISO8601>' }. Use this instead of raw valid_until arithmetic.
  // expiry.type === 'never' → no expiration; expiry.type === 'date' → new Date(expiry.value)
  expiry: { type: 'never'; value: null } | { type: 'date'; value: string };

  source_access_request_id: string | null;
  source_access_request: {            // ⚠️ GAP — see §2.5 TODO-API-1
    id: string;
    purpose: string | null;           // requester's stated reason
    requester: { name: string; email: string } | null; // who filed the request
    reviewed_at: string | null;       // when it was approved
    decision_reason: string | null;   // reviewer's note
  } | null;
  source_preset_id: number | null;
  source_preset: { id: number; name: string } | null;      // ⚠️ GAP — see §2.5 TODO-API-1
  issuing_authority_id: string | null;
  issuing_authority: { id: string; name: string } | null;  // ⚠️ GAP — see §2.5 TODO-API-1
  revoking_authority_id: string | null;
  revoking_authority: { id: string; name: string } | null; // ⚠️ GAP — see §2.5 TODO-API-1

  resource: {
    id: string;
    type: "DATASET" | "COLLECTION";
    dataset: { name: string } | null;
    collection: { name: string } | null;
  };

  access_type: {
    id: number;
    name: string;
    description: string | null;
  };

  grantor: {
    name: string;
    email: string;
  } | null;

  revoker: {
    name: string;
    email: string;
  } | null;
};
```

### 2.4 Access Type Catalog Shape

Fetched once by the parent from `GET /grants/access-types` and passed as a prop or via a composable.

```typescript
type AccessType = {
  id: number;
  name: string;
  description: string | null;
};
```

### 2.5 API Gaps — Action Required

The following gaps have been resolved.

---

#### ~~TODO-API-1~~ ✅ RESOLVED: Add `issuing_authority`, `revoking_authority`, `source_preset`, `source_access_request` to `GRANT_INCLUDES`

**File:** `api/src/services/grants/fetch.js` — implemented.

`GRANT_INCLUDES` now includes:
```js
issuing_authority: { select: { id: true, name: true } },
revoking_authority: { select: { id: true, name: true } },
source_preset: { select: { id: true, name: true } },
source_access_request: {
  select: {
    id: true,
    purpose: true,
    reviewed_at: true,
    decision_reason: true,
    requester: { select: { name: true, email: true } },
  },
},
```

---

#### ~~TODO-API-2~~ ✅ RESOLVED: Add `creation_type`, `source_preset_id`, and `expiry` to raw SQL responses

**File:** `api/src/services/grants/fetch.js` — implemented.

Both `listGrantsForResourceGrouped` and `listGrantsForSubjectGrouped` now:
1. Include `creation_type` and `source_preset_id` in the `json_build_object` SQL clause
2. Post-process results via `addExpiryToGrants()` which calls `Expiry.fromValue(valid_until).toJSON()` on each grant, yielding `{ type: 'never' | 'date', value: null | '<ISO>' }` — matching the Prisma client extension in `db.js`

This standardizes the API interface: all grant responses (ORM and raw SQL) carry the same `expiry` shape.

---

#### ~~TODO-UI-1~~ ✅ RESOLVED: Add `getGrantsForSubject` method to `ui/src/services/v2/grants.js`

Implemented:
```js
getGrantsForSubject(subject_type, subject_id, resource_type, resource_id, params = {}) {
  return api.get(`/grants/${subject_type}/${subject_id}/${resource_type}/${resource_id}`, { params });
},
```

---

#### TODO-SCOPE-1: Collection-inherited grants on Dataset pages (out of scope for now)

The current `listGrantsForResourceGrouped` query filters on `g.resource_id = :resource_id`. This means grants issued on a collection do not appear when viewing a dataset's grants, even if the dataset is in that collection.

A dataset grants panel that shows `grant.resource.type === "COLLECTION"` badges would require a separate query that includes collection-inherited grants. This is **intentionally deferred** — the component is first deployed on the collection grants tab where this scenario does not arise. Track as a future enhancement.

---

### 2.6 Derived Display Fields

These fields are computed client-side from the raw API response. They are not fetched separately.

> **Expiry — unified across both phases:**  
> Both collapsed and expanded grants now carry an `expiry` field: `{ type: 'never', value: null }` or `{ type: 'date', value: '<ISO8601>' }`. Collapsed grants get this via `addExpiryToGrants()` post-processing in the API service (mirrors the Prisma db.js extension). Expanded grants receive it from the Prisma ORM computed field. Use `expiry` everywhere — do not use raw `valid_until` arithmetic.

| Display Need | Grant Phase | Source | Computed As |
|---|---|---|---|
| Access type name (pills) | Collapsed | `access_type_id` + `accessTypeMap` prop | `accessTypeMap[grant.access_type_id].name` |
| Is active (pill filter) | Collapsed | `revoked_at`, `valid_from`, `expiry` | `revoked_at == null && valid_from <= now && (expiry.type === 'never' \| new Date(expiry.value) > now)` |
| Days until expiry (pills) | Collapsed | `expiry` | `expiry.type === 'never' ? Infinity : Math.floor((new Date(expiry.value) - Date.now()) / 86400000)` |
| Has expiry ≤14 days (badge) | Collapsed | `expiry` | As above |
| Is active (row ordering) | Expanded | `revoked_at`, `expiry` | `revoked_at == null && (expiry.type === 'never' \| new Date(expiry.value) > now)` |
| Days until expiry (row) | Expanded | `expiry` | Same formula as collapsed |
| Expiry sort key | Expanded | `expiry` | `expiry.type === 'never' ? Infinity : new Date(expiry.value).getTime()` |
| Provenance type | Expanded | `creation_type` | `"request"` / `"manual"` / `"system"` |
| Resource name | Expanded | `resource.dataset.name` or `resource.collection.name` | Based on `resource.type` |
| Grantor name | Expanded | `grantor.name` | Direct |
| Preset name | Expanded | `source_preset.name` | Direct (now hydrated) |
| Issuing authority name | Expanded | `issuing_authority.name` | Direct (now hydrated) |
| Requester name | Expanded | `source_access_request.requester.name` | Direct (now hydrated) |
| Request purpose | Expanded | `source_access_request.purpose` | Direct (now hydrated) |

---

## Part 3 — UI Specification

### 3.1 Tech Stack

- **Framework:** Vue 3 Composition API (`<script setup>`)
- **UI Library:** Vuestic UI (`VaButton`, `VaCard`, etc.)
- **Styling:** Tailwind CSS with dark mode (`dark:` prefix)
- **Icons:** Material Design Icons via `<i-mdi-*>` or `<Icon icon="mdi-..." />`
- **Date Handling:** `@/services/datetime`
- **Utilities:** `initials()` from `@/services/utils`, `stringToRGB()` from `@/services/colors`
- **Utility Components:** [`SubjectAvatar`](../SubjectAvatar.vue), [`EmptyState`](../../utils/EmptyState.vue), [`ModernChip`](../../utils/ModernChip.vue)

### 3.2 Component Hierarchy

```
GrantsBySubjectPanel
├── EmptyState                     (if subjectGroups is empty)
└── SubjectCard[]                  (one per SubjectGrantGroup)
    ├── CardHeader                 (always visible; click to expand/collapse)
    │   ├── SubjectAvatar          (34×34px)
    │   ├── SubjectInfo            (name + meta, 150px fixed width)
    │   ├── GrantsPreview          (pills of active access types)
    │   └── HeaderBadges           (expiry badge + chevron)
    └── CardBody                   (visible when expanded)
        ├── ExpandedLoadingState   (skeleton while fetching expanded data)
        ├── GroupAccessNote        (if subject.type === "GROUP")
        └── GrantRow[]             (one per expanded grant, active first then revoked)
            ├── AccessTypeName
            ├── AccessTypeDescription
            ├── TagRow             (creation type + preset + "via collection" tags)
            ├── DateRow            (granted date + expiry)
            ├── ProvenanceBox      (origin, authority, revocation details)
            └── RevokeButton       (only for active grants, if canRevoke)
```

### 3.3 Props Interface

```typescript
type Props = {
  // Subject information: id, type, and optional user/group details
  subject: { id: string; type: "USER" | "GROUP"; user?: User; group?: Group };

  // Array of grants for this subject
  grants: Grant[];

  // Access type catalog from GET /grants/access-types (built by parent)
  accessTypeMap: Record<number, AccessType>;

  // Resource context for the expanded fetch
  resourceType: "DATASET" | "COLLECTION";
  resourceId: string;           // resource UUID (not subject UUID)

  // Whether the current user can revoke grants on this resource
  canRevoke: boolean;

  // Emitted Events
  // - revoke: Emitted when a grant is revoked (e.g., @revoke="handleRevoke")
  // - navigate-to-request: Emitted when user clicks to navigate to a grant request
};
```

### 3.4 Internal State

```typescript
// Expansion state
const isExpanded = ref(false);

// Expanded data (lazy-loaded on first expansion)
const expandedGrants = ref<ExpandedGrant[] | null>(null);
const expandedLoading = ref(false);
const expandedError = ref<Error | null>(null);
```

Expansion fetches `GET /grants/:subject_type/:subject_id/:resource_type/:resource_id` on first open. Subsequent expansions reuse the cached `expandedGrants`. Refetch is triggered by parent after a revoke event (parent re-passes updated prop, which resets the cache if `subjectGroup` changes identity).

---

### 3.5 CardHeader

#### Layout

Single-row flex. No wrapping.

```
[SubjectAvatar 34px] [SubjectInfo 150px] [GrantsPreview flex:1] [HeaderBadges shrink:0]
```

Classes: `flex items-center gap-3 px-4 py-3 cursor-pointer rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-200 select-none`

#### SubjectAvatar

Use `<SubjectAvatar :subject="subjectGroup.subject" size="base" />`. 34×34px circle. `flex-shrink-0`.

#### SubjectInfo

Fixed-width container: `w-[150px] flex-shrink-0 flex flex-col gap-0.5 overflow-hidden`

**Line 1 — Name** (`text-sm font-medium text-gray-900 dark:text-gray-100 truncate`):
- User: `user.name`
- Group: `group.name`

**Line 2 — Meta** (`text-xs text-gray-600 dark:text-gray-400 truncate`):
- User: `user.email`
- Everyone group (id `00000000-0000-0000-0000-000000000000`): `"System · all authenticated users"`
- Normal group: `group.description`
- Archived group: render `"[Archived]"` prefix in `text-amber-700 dark:text-amber-500` followed by the description in default secondary color

#### GrantsPreview

`flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden`

Show pills for the **first 3 active grants** (where `revoked_at == null && valid_until > now or null`), sorted by expiry urgency (soonest expiring first). Remaining active grants shown as overflow count.

**Computing pills:**
1. Filter: `activeGrants = grants.filter(g => g.revoked_at == null && isActive(g))`
2. Sort: expiring-within-14-days first, then by `valid_until` ascending, then by `access_type_id`
3. Display: first 3 as pills, remainder as `"+N more"` text

**Pill base classes:** `text-xs px-2 py-0.5 rounded-full border border-solid whitespace-nowrap flex-shrink-0`

| Grant State | Additional Classes |
|---|---|
| Normal (no expiry) | `border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300` |
| Expiring ≤14 days | `border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300` |
| Via collection | Replace `border-solid` with `border-dashed`; add `title="Via collection: {name}"` |

**Pill Label:**
- Normal: `accessTypeMap[grant.access_type_id].name`
- Expiring (≤14 days): `"{name} · Expires in {N}d"` where N = `floor((valid_until - now) / 86400000)`

**Overflow indicator:** `text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0` — text only, no border or background.

#### HeaderBadges

`flex items-center gap-2 flex-shrink-0 ml-1`

1. **Expiry badge** — shown if any active grant (including overflow) has ≤14 days remaining:
   - `text-xs font-medium px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300`
   - Label: `"Expiring"`

2. **Chevron** — always present:
   - `<i-mdi-chevron-down class="text-base text-gray-500 dark:text-gray-400 transform transition-transform duration-200" />`
   - Add `rotate-180` class when `isExpanded`

---

### 3.6 CardBody

Shown when `isExpanded`. No animation required — `v-show` is sufficient.

Classes: `border-t border-solid border-gray-200 dark:border-gray-700 px-4 py-3 flex flex-col gap-3`

#### Expanded Loading State

While `expandedLoading`:
```vue
<div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
  <i-mdi-loading class="animate-spin" />
  <span>Loading grant details…</span>
</div>
```

#### Expanded Error State

If `expandedError`:
```vue
<ErrorState title="Failed to load grant details" :message="expandedError.message" @retry="fetchExpandedGrants" />
```

#### GroupAccessNote

Shown only when `subject.type === "GROUP"`. Rendered above all GrantRows.

`text-xs text-gray-600 dark:text-gray-400 mb-1`

Text: `"All effective members of this group — including members of subgroups — have the access listed below."`

---

### 3.7 GrantRow

One row per grant from `expandedGrants`. Active grants first, revoked grants at bottom.

**Layout:** `flex flex-col gap-1 py-2.5 px-3`

**Separators:** `border-b border-solid border-gray-200 dark:border-gray-700` between rows; no border on last row.

**Revoked grants:** `opacity-60`. No RevokeButton.

#### 3.7.1 Access Type Name

`text-sm font-medium text-gray-900 dark:text-gray-100`

Content: `accessTypeMap[grant.access_type_id]?.name ?? "Unknown access type"`

If revoked: add `line-through` class.

#### 3.7.2 Access Type Description

`text-xs text-gray-600 dark:text-gray-400 mt-0.5`

Content: `grant.access_type.description` (from expanded data). Omit if null.

#### 3.7.3 TagRow

`flex flex-wrap gap-1.5 mt-1`

All tags: `text-xs font-medium px-2 py-0.5 rounded-sm`

| Tag | Condition | Classes |
|---|---|---|
| `"Access request"` | `creation_type === "ACCESS_REQUEST"` | `bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300` |
| `"Manual"` | `creation_type === "MANUAL"` | `bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300` |
| `"System"` | `creation_type === "SYSTEM_BOOTSTRAP"` | `bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300` |
| `"Revoked"` | `revoked_at !== null` | `bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500` |
| `"{preset.name}"` | `source_preset !== null` (after TODO-API-1) | `bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300` |
| `"via collection"` | `resource.type === "COLLECTION"` | `bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300` |

> **Note:** Until TODO-API-1 is resolved, the `source_preset_id` integer is available but `source_preset.name` is not. Show a fallback `"Preset #{id}"` or omit the tag in the interim.

#### 3.7.4 DateRow

`flex items-center gap-1.5 text-xs mt-1`

Format: `"Granted {date}"` ·  `"{expiry text}"`

- Date: `datetime.date(grant.valid_from)` → e.g. `"Apr 1, 2026"`
- Separator: `<span class="text-gray-400 dark:text-gray-500">·</span>`

**Use `grant.expiry` for all expiry display logic** (available in both collapsed and expanded grants). `expiry` serializes as `{ type: 'never' | 'date', value: null | '<ISO>' }`. For days remaining: `const daysLeft = grant.expiry.type === 'never' ? Infinity : Math.floor((new Date(grant.expiry.value) - Date.now()) / 86400000)`.

**Expiry text:**

| Condition | Text | Classes |
|---|---|---|
| `expiry.type === 'never'` | `"No expiry"` | `text-gray-600 dark:text-gray-400` |
| `daysLeft > 14` | `"Expires {date(expiry.value)}"` | `text-gray-600 dark:text-gray-400` |
| `1 ≤ daysLeft ≤ 14` | `"Expires in {N} day(s)"` | `text-red-700 dark:text-red-400 font-medium` |
| `daysLeft === 0` | `"Expires today"` | `text-red-700 dark:text-red-400 font-medium` |
| `daysLeft < 0` | `"Expired {date(expiry.value)}"` | `text-red-700 dark:text-red-400 font-medium` |

#### 3.7.5 ProvenanceBox

`mt-1.5 px-3 py-2 rounded-md border-l-2 border-r border-t border-b border-solid bg-gray-50 dark:bg-gray-900/30 border-l-gray-400 dark:border-l-gray-500 border-r-gray-200 dark:border-r-gray-700 border-t-gray-200 dark:border-t-gray-700 border-b-gray-200 dark:border-b-gray-700`

Each row: `flex gap-2 text-xs`

- **Label:** `w-[72px] flex-shrink-0 font-medium text-gray-500 dark:text-gray-400`
- **Value:** `text-gray-700 dark:text-gray-300`
- **Links:** `text-blue-600 dark:text-blue-400 hover:underline cursor-pointer`

**Rows to render:**

**Row: Grant on** (only if `resource.type === "COLLECTION"`):
- Label: `"Grant on"`
- Value: `"Collection: {collection.name} — covers all datasets in this collection"`

**Row: Origin:**

| `creation_type` | Value |
|---|---|
| `ACCESS_REQUEST` | `"Approved via access request"` + clickable link (emits `navigate-to-request` event with request_id) + `"· approved by {grantor.name}"`. If `source_access_request.requester` is available (after TODO-API-1): append `"on behalf of {requester.name}"`. If `source_access_request.purpose`: render as a sub-line `"Purpose: {purpose}"` in secondary color. |
| `MANUAL` | `"Granted manually by {grantor.name}"` (or `"Granted by (unknown)"` if null) |
| `SYSTEM_BOOTSTRAP` | `"System-issued on setup"` |

**Row: Preset** (only if `source_preset !== null`, after TODO-API-1):
- Label: `"Preset"`
- Value: `"Issued as part of '{preset.name}'"` — describes provenance, not a revocation unit

**Row: Authority** (only if `issuing_authority !== null`, after TODO-API-1):
- Label: `"Authority"`
- Value: `"Granted under authority of {issuing_authority.name}"`

**Row: Justification** (only if `justification !== null`):
- Label: `"Note"`
- Value: `grant.justification`

**Row: Revoked** (only if `revoked_at !== null`):
- Label: `"Revoked"`
- Value: `"{date(revoked_at)}"` + if `revoker.name`: `"by {revoker.name}"` + if `revocation_reason`: `"· Reason: {revocation_reason}"`

#### 3.7.6 RevokeButton

Only rendered when `canRevoke && grant.revoked_at === null`.

```vue
<button
  class="mt-1 self-start text-xs px-3 py-1.5 rounded-md border border-solid
         text-red-700 dark:text-red-400 border-red-300 dark:border-red-700
         hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
  @click.stop="emit('revoke', grant.id)"
>
  Revoke
</button>
```

No internal confirmation. The caller handles confirmation and refetch.

---

### 3.8 States and Edge Cases

#### 3.8.1 Empty State

If `subjectGroups` is empty (handled by parent, not this component):
```vue
<EmptyState title="No grants on this resource" />
```

#### 3.8.2 Revoked Grants

`revoked_at` is set. Render at the bottom of the GrantRow list. `opacity-60`. ProvenanceBox shows revocation date, revoker name, and reason. No RevokeButton.

#### 3.8.3 Everyone (system) group

Fixed UUID: `00000000-0000-0000-0000-000000000000`. When `group.id` matches, SubjectInfo line 2 reads `"System · all authenticated users"`.

#### 3.8.4 Archived Group

If `group.is_archived === true`: SubjectInfo line 2 prepends `"[Archived] "` in `text-amber-700 dark:text-amber-500`. Revoke button still renders — archiving does not block grant management.

#### 3.8.5 Group Subjects (hierarchy note)

GroupAccessNote in CardBody reads:
> *"All effective members of this group — including members of subgroups — have the access listed below."*

This is stated once, not repeated per grant row.

#### 3.8.6 Multiple subjects expanded simultaneously

Cards are independent. Multiple cards can be open at once. No accordion behavior.

---

### 3.9 Expand Behavior and Data Lifecycle

```
User clicks header
  → isExpanded = true
  → if expandedGrants === null:
      expandedLoading = true
      fetch GET /grants/:subject_type/:subject_id/:resource_type/:resource_id
      on success: expandedGrants = response.data; expandedLoading = false
      on error:   expandedError = error; expandedLoading = false
  → render CardBody with expandedGrants (or loading/error state)

User clicks header again
  → isExpanded = false (card collapses; expandedGrants retained in memory)

Parent calls refetch after revoke
  → parent re-renders with updated subjectGroup prop
  → component should watch subjectGroup.grants for changes
  → if grants list changes (e.g. count differs): reset expandedGrants = null to force re-fetch on next expansion
```

---

### 3.10 Visual Token Reference

| Purpose | Light | Dark |
|---|---|---|
| Card border | `border-gray-200` | `dark:border-gray-700` |
| Hover background | `hover:bg-gray-50` | `dark:hover:bg-gray-800/50` |
| Primary text | `text-gray-900` | `dark:text-gray-100` |
| Secondary text | `text-gray-600` | `dark:text-gray-400` |
| Tertiary text | `text-gray-500` | `dark:text-gray-500` |
| Danger | `text-red-700 border-red-300` | `dark:text-red-400 dark:border-red-700` |
| Amber / warning | `bg-amber-100 text-amber-900 border-amber-400` | `dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-600` |
| Blue / info | `bg-blue-100 text-blue-800` | `dark:bg-blue-900/40 dark:text-blue-300` |
| Purple / preset | `bg-purple-100 text-purple-800` | `dark:bg-purple-900/40 dark:text-purple-300` |
| Teal / collection | `bg-teal-100 text-teal-800` | `dark:bg-teal-900/40 dark:text-teal-300` |
| Provenance border-left | `border-l-gray-400` | `dark:border-l-gray-500` |
| Provenance background | `bg-gray-50` | `dark:bg-gray-900/30` |

---

## Appendix: Open TODOs Summary

| ID | Location | Description | Status |
|---|---|---|---|
| ~~TODO-API-1~~ | `api/src/services/grants/fetch.js` | Add `issuing_authority`, `revoking_authority`, `source_preset`, `source_access_request` to `GRANT_INCLUDES` | ✅ Done |
| ~~TODO-API-2~~ | `api/src/services/grants/fetch.js` | Add `creation_type`, `source_preset_id`, `expiry` to raw SQL grouped responses | ✅ Done |
| ~~TODO-UI-1~~ | `ui/src/services/v2/grants.js` | Add `getGrantsForSubject(...)` method | ✅ Done |
| TODO-SCOPE-1 | Architecture | Collection-inherited grants on Dataset pages require a separate aggregation query | Deferred |

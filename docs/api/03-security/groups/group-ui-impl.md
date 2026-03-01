## Plan: Groups, Collections, Access UI + API Fixes

All new UI lives under `ui/src/pages/v2/` and is fully independent of existing pages. The existing rawdata, dataproducts, dashboard pages are untouched. Groups is the first milestone.

---

### UI Implementation Plan

**Conventions (per coding standards + design docs):**
- Vuestic UI components everywhere (`VaButton`, `VaInput`, `VaCard`, `VaDataTable`, etc.)
- Tailwind for layout/spacing with dark mode pairs
- MDI icons via `<i-mdi-*>` or `<Icon icon="mdi-*" />`
- Capability-based rendering: same components, controls disabled/hidden based on user authority
- Authority badges: `Member`, `Admin`, `Oversight`, `Platform Admin` shown inline

---

### Milestone 1 — Foundation

**1.1 New service layer** (`ui/src/services/v2/`)
- `groups.js` — axios wrappers for all group endpoints
- `collections.js` — axios wrappers for collection endpoints
- `access-requests.js` — wrappers for access request lifecycle
- `grants.js` — wrappers for grants CRUD

**1.2 New Pinia stores** (`ui/src/stores/v2/`)
- `groups.js` — selected group state, member cache
- `collections.js`
- `access.js` — pending requests count (used in nav badge)

**1.3 New router layout** (`ui/src/pages/v2/`)
- `index.vue` — v2 shell layout with the five-domain primary nav: Home | Groups | Datasets | Collections | Access | Admin (conditional)
- Layout uses `<RouterView>` and a persistent sidebar/topbar matching the existing app's layout patterns
- Auth guard re-used from existing `router/index.js`

---

### Milestone 2 — Home (v2)

**Pages:**
- `ui/src/pages/v2/home.vue` — role-aware home screen

**Sections rendered conditionally by role:**

*Normal user*: My Groups, Datasets in My Groups (recent), Shared With Me

*Group admin*: Groups I Admin, Pending Access Requests (badge count), Expiring Grants

*Platform admin*: System Metrics (total datasets, active grants, archived groups), Recent High-Risk Activity, Incident Controls

Each section is a card component; all sections exist in the file but `v-if` gates control which render. Authority derived from `auth` store (`user.roles`).

---

### Milestone 3 — Groups Domain (Priority 1)

**Pages:**
- `ui/src/pages/v2/groups/index.vue` — Groups list page
- `ui/src/pages/v2/groups/[id]/index.vue` — Group detail page

**Groups List (`groups/index.vue`):**
- Search box + filters: My Groups | Admin Groups | All (platform admin only)
- `?is_archived` filter toggle
- Table/card grid of results using `POST /groups/search`
- "Create Group" button (platform admin only) → modal with name, description fields
- Each row: group name, member count, authority badge, archived indicator

**Group Detail (`groups/[id]/index.vue`):**

Tabs (capability-gated):
- **Overview** — name, description, parent chain breadcrumb (from `/ancestors`), visibility, archived status. All roles.
- **Members** — paginated member list with role badges. Normal user: read-only. Group admin: Add Member button (user search + select modal), Remove button per member. Authority `Oversight` label shown if caller is ancestor admin only.
- **Admins** — list of admins. Group admin: Promote/Demote controls (guarded by `ensureNotRemovingLastAdmin` error handling).
- **Owned Datasets** — calls `GET /groups/:id/datasets` once API is implemented. Shows dataset name, type, visibility indicator. Admin: link to dataset detail.
- **Owned Collections** — calls `GET /groups/:id/collections`.
- **Activity Log** — calls `GET /authorization_audit` filtered to this group (if endpoint exposed, or leave as future).
- **Settings** (group admin + platform admin only) — Edit metadata form (optimistic lock via `?version=`), Archive Group button (confirm dialog), Unarchive (platform admin only).

**Oversight distinction component:** `<AuthorityBanner>` — shows a non-dismissable info banner "Oversight visibility only — you are an ancestor admin. Mutations are disabled." when caller is oversight-only.

**New shared components** (`ui/src/components/v2/groups/`):
- `GroupCard.vue` — summary card
- `GroupBreadcrumb.vue` — renders ancestor chain
- `GroupMemberTable.vue` — member list with role badges + inline actions
- `UserSearchModal.vue` — debounced user search for adding members (calls `GET /users` with search)
- `ArchiveConfirmModal.vue` — reusable archive dialog
- `AuthorityBanner.vue` — oversight-only warning

---

### Milestone 4 — Collections Domain

**Pages:**
- `ui/src/pages/v2/collections/index.vue` — Collections list
- `ui/src/pages/v2/collections/[id]/index.vue` — Collection detail

**Collections List:**
- Search + filter: Owned by My Groups | Visible | All (platform admin)
- "Create Collection" button (group admin) → modal: name, description, owner_group selector (filtered to groups user admins)

**Collection Detail:**

Tabs:
- **Overview** — owner group, description, visibility summary
- **Datasets** — list of datasets in collection (`GET /collections/:id/datasets`). Group admin: Add Dataset (dataset search + access impact preview modal showing "Adding this dataset changes access for N subjects") + Remove button. Impact preview is a confirmation dialog before `POST /collections/:id/datasets`.
- **Access** — active grants, grant history. Group admin: Grant Access button (subject picker + access type selector → calls `POST /grants/`), Revoke button per grant.
- **Settings** (group admin only) — Edit metadata, Archive Collection, Unarchive (platform admin only)

**New shared components** (`ui/src/components/v2/collections/`):
- `CollectionCard.vue`
- `DatasetAddModal.vue` — search + access impact preview before confirm
- `GrantTable.vue` — reusable active grants display with revoke action
- `GrantAccessModal.vue` — subject (user/group) picker + access type checkboxes

---

### Milestone 5 — Access Domain

**Pages:**
- `ui/src/pages/v2/access/index.vue` — Access hub (tab container)
- Sub-views composed as components, not separate pages:

**My Requests tab:**
- Lists `GET /access-requests/requested-by-me`
- Status chips: Submitted | Approved | Rejected | Expired
- Withdraw button on UNDER_REVIEW requests

**Pending Review tab** (group admin only):
- Lists `GET /access-requests/pending-review`
- Per-request: approve/reject each item, justification text field, duration modifier
- Calls `POST /access-requests/:id/review`

**Active Grants tab:**
- Group admin: grants on their group-owned resources (calls `GET /grants?resource_type=...`)
- Platform admin: full grant explorer with filters + revoke

**Expiring Grants tab:**
- Filtered subset of Active Grants where `valid_until` is within 30 days

**Access Simulation** (platform admin only, separate sub-tab):
- User picker + Dataset picker → calls `GET /grants?subject_type=USER&subject_id=` chained with membership resolution
- Output: membership path, grant path, collection path, expiration details

**New shared components** (`ui/src/components/v2/access/`):
- `AccessRequestCard.vue`
- `ReviewPanel.vue`
- `GrantExplorer.vue` — filterable grants table (reused in dataset and collection detail tabs too)
- `AccessExplanation.vue` — "Why do I have access?" expandable panel, used on dataset and collection detail pages

---

### Milestone 6 — Dataset Detail Enhancements (v2)

**Page:** `ui/src/pages/v2/datasets/[id]/index.vue`

This is a new page, not modifying the existing `datasets/[datasetId]/index.vue`.

Adds the governance surfaces missing from the old page:
- **Access tab** — `<GrantTable>` + `<AccessExplanation>` + Request Access button for non-admins
- **Collections tab** — which collections contain this dataset
- **Settings tab** (group admin) — archive dataset, change visibility preset (future), freeze (platform admin)
- **Why I have access** panel on Overview tab — uses `<AccessExplanation>`
- **Authority badges** next to owner group name

---

### Milestone 7 — Admin Domain Entry Point

**Page:** `ui/src/pages/v2/admin/index.vue` — shown only when `user.roles.includes('admin')` or user is group admin

Links to:
- Group Administration (→ groups list filtered to groups I admin)
- Dataset Governance (→ datasets list filtered to owned by my groups)
- Collection Governance (→ collections list filtered to owned by my groups)
- Access Governance (→ active grants explorer)
- System Settings (platform admin only → global group explorer, system metrics)

---

### Cross-Cutting Components

**Visibility Indicator** (`VisibilityBadge.vue`): Private | Group-visible | Institutionally Discoverable | Public — derived from active grants, shown on every dataset + collection card.

**Authority Badge** (`AuthorityBadge.vue`): Member | Admin | Oversight | Platform Admin — used inline alongside user/group names everywhere.

---

### Verification

1. Register all new routes in index.js (or verify file-based routing picks up `v2/**`)
2. Validate API fixes with integration test calls before UI stories (fix route registration bugs first)
3. Per-milestone: smoke-test each page in browser with a user of each role type (normal user, group admin, platform admin)
4. Check all `v-if` authority gates actually match the policy engine's behavior — no UI-only enforcement
5. Verify `<GrantTable>` revoke calls return 204 and re-fetches grant list without full page reload

**Decisions:**
- All new pages under `v2/` prefix — zero changes to existing pages
- Groups first, then Collections, then Access, then Dataset v2 page, then Admin hub
- No feature implementation for: group reparenting, transfer ownership, grant presets, access request renewal, dataset creation from UI
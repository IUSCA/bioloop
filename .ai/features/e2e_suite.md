# E2E suite — feature memory

**Purpose:** Living inventory for Playwright e2e work: route map, role gates, proposed scenarios (documentation only for now), and explicit TODOs.  
**Scope note:** Scenario lists **exclude** Imports, Uploads, and Notifications (per product request).  
**Accuracy:** Route map + §3 are aligned with a **deep read** of Projects / Dataset / collections / Workflows / Alerts / Stats / About / Profile / auth / file browser shells on 2026-03-20. Finer behavior (every modal field rule, worker-backed outcomes) still needs validation when writing specs.

**External references (this host):**

- `/Users/ripandey/dev/bioloop_agent_docs/docker-e2e-change-log.md` — Docker e2e ports, CI auth, three-way `enabledForRoles` sync, project isolation patterns.
- Remote branches worth mining for *patterns* (not blind copy): `origin/uploads-rewrite`, `origin/dataset-creation-notification` (extra notification specs there are out of scope for *documented* scenarios here). Other `origin/*e2e*` branches may be stale vs current `tests/` layout — prefer fresh specs aligned with `playwright.config.js` on `main`. **Ignore** `origin/173-e2e` (superseded).

---

## 1. Route & view map (file-based routing)

Routing uses Vue Router file-based routes from `ui/src/pages/` (see `ui/src/router/index.js` + auto-routes). `meta.requiresAuth` defaults to required unless explicitly `requiresAuth: false`. `meta.requiresRoles` restricts operator/admin for listed routes.

### 1.1 Sidebar vs non-sidebar

**Approximate “primary nav” (from `ui/src/constants.js`):**

| Audience | Sidebar entries | Paths |
|----------|-----------------|-------|
| **user** | Projects; Create Dataset (nested: Import, Upload per feature flags) | `/projects`, `/datasets/import`, `/datasetUpload` |
| **operator/admin** | Dashboard, Raw Data, Data Products, User Management, Stats/Tracking, Workflows, Alerts (feature_key), … + user items | `/dashboard`, `/rawdata`, `/dataproducts`, `/users`, `/stats`, `/workflows`, `/alerts`, … |
| **bottom (all authenticated)** | About, Profile, Logout | `/about`, `/profile`, `/auth/logout` |

**Admin-only sidebar list:** `admin_items` is empty; Grafana is a hard-coded external link in `Sidebar/index.vue`.

**Not in sidebar (nested / deep links / redirects):**

| Path | How users arrive |
|------|------------------|
| `/` | Default after login; redirects by role (`index.vue`) |
| `/projects/new` | “Create Project” (operator/admin) |
| `/projects/:projectId` | From projects table |
| `/projects/:projectId/datasets/:datasetId` | From project datasets table (`ProjectDatasetsTable.vue`) |
| `/datasets/:datasetId` | From dataset lists, tasks, workflow links, upload/import flows |
| `/datasets/:datasetId/filebrowser` | “Browse Files” on dataset detail |
| `/datasetUpload/new` | From uploads index (out of scope for scenarios) |
| `/auth/*`, `/auth/logout` | Login flows, header dropdown |

**404:** `ui/src/pages/[...all].vue` — catch-all.

### 1.2 Role restrictions (`requiresRoles` on pages)

From `definePage` / `<route lang="yaml">` in `ui/src/pages`:

| Path area | Roles |
|-----------|--------|
| `/rawdata`, `/dataproducts`, `/datasets/:id`, `/datasets/:id/filebrowser`, `/projects/:id/datasets/:datasetId`, `/projects/new`, `/users`, `/stats`, `/alerts`, `/workflows` | `operator`, `admin` |
| `/profile`, `/projects`, `/`, `/dashboard` (no explicit requiresRoles in snippet; dashboard used by operators) | Authenticated (see sidebar: user never sees dashboard link but may hit `/` → `/projects`) |

**Router guard behavior:** If `requiresRoles` is set and the user shares no role with the list, navigation is **aborted** (`return false` in `auth_guard`). E2E should cover direct URL entry vs in-app navigation.

### 1.3 Feature flags (`ui/src/config.js` declares spec; `ui/src/services/features.js` resolves env → `enabledFeatures`)

Not exhaustive: `import`, `uploads`, `notifications` use `enabledForRoles`; `alerts`, `downloads`, `genomeBrowser`, `auto_create_project_on_dataset_creation` also matter for UI. **Tests + UI + `tests/config/default.json` must stay in sync** (see docker e2e changelog §7).

---

## 2. Existing automated tests (do not duplicate scenarios)

| Area | Spec files (`tests/src/tests/`) | Notes |
|------|----------------------------------|-------|
| Import | `view/authenticated/import/**` | Stable reference implementation; **excluded** from new scenario doc |
| Upload | `view/authenticated/upload/**` | **excluded** from scenario doc (specs live under `tests/src/tests/view/authenticated/upload/`) |
| Notifications | `view/authenticated/notifications/**` | **excluded** |
| Sidebar | `sidebar/user_role_sidebar_view.spec.js`, `sidebar/non_user_role_sidebar_view.spec.js` | Minimal visibility only |
| User management | `userManagement/user_management.spec.js` | Create-user modal serial tests |
| Project | `project/project-dataset-table.spec.js`, `project/project-merge-modal.spec.js`, `project/project-navigation.spec.js` | Running under `project` Playwright project after config fix |
| Unauthenticated | `view/unauthenticated/project.spec.js`, `view/unauthenticated/navigation_guard_redirect.spec.js` | Running under `unauthenticated` Playwright project after config fix |

---

## 3. Documented scenario backlog (excluding Import / Upload / Notifications)

Below: **proposed** cases for future implementation. Skip items that duplicate §2 when those specs actually run. **Appendix A** lists code-derived control wiring (pagination keys, polling, `data-testid`, role matrices) to speed spec authoring.

### 3.1 Global shell & navigation

- After login, `/` sends **operator/admin** to `/dashboard` and **user** to `/projects` (`index.vue`).
- Header logo navigates to `/` (then redirect chain as above).
- Sidebar: operator/admin see expected `data-testid` items; user does **not** see operator-only items (already partially covered — extend for any new sidebar items).
- Header user menu: links to `/profile` and `/auth/logout`.
- **Edge:** Deep-link to a route requiring roles the user lacks → navigation blocked; URL unchanged / no crash.
- **Edge:** `redirect_to` on auth: visit `/auth?redirect_to=/projects/...`, log in (CI ticket), land on intended path.

### 3.2 Auth & unauthenticated

- Unauthenticated visit to `/projects` shows login UI (existing `project.spec.js` intent).
- `/about` reachable without login (`requiresAuth: false`).
- Logout route clears session and prevents authenticated API calls from UI (smoke).

### 3.3 Projects list (`/projects`)

- **API:** `forSelf: !auth.canOperate` — users see only their projects; operators see broader list.
- Search input debounces; results and URL query (`useQueryPersistence` key `q`) update.
- Sorting by columns + sort order; “Reset Sort” appears only when sort diverges from default.
- Pagination: change page size, page number; totals consistent.
- **Role:** “Create Project” visible only when `auth.canOperate`.
- Row project name links to `/projects/:slug`.
- Edit icon opens modal; cancel vs save (if not redundant with user-management patterns).
- Delete flow opens confirm; cancel vs confirm (use isolated test data).

### 3.4 Project detail (`/projects/:projectId`)

- **Fetch:** `projectService.getById` with `forSelf: !auth.canOperate` (user gets a self-scoped project payload).
- General info card; **AddEditButton** opens `EditProjectInfoModal` only when `auth.canOperate`.
- Access permissions card: **entire card** is `v-if="auth.canOperate"`; `ProjectUsersList` + assign controls only for operators.
- **Slug change:** after edit, if `slug` changes, `handleEditUpdate` **`router.push`** to `/projects/:new_slug`; else sets `triggerDatasetsRetrieval` to re-pull datasets.
- **ProjectDatasetsTable** (`data-testid="project-datasets-table"`, pagination `project-datasets-pagination`):
  - Server-driven sort/filter/pagination via `projectService.getDatasets`; page size options **10, 20, 50** (not the same as projects list).
  - Search box filters by **dataset name** (`name` query); `DatasetFiltersGroup` with `['staged']` toggle.
  - **Name cell:** `router-link` to nested dataset route **only if** `auth.canOperate`; else plain text (user sees names but no link — critical e2e).
  - **Stage column:** spinners when `is_archival_pending` / `is_staging_pending` (workflow step checks); cloud button opens `StageDatasetModal`.
  - **Download column:** opens `DatasetDownloadModal`; disabled unless `rowData.is_staged`.
  - **Assigned column:** only in table when `auth.canOperate`.
  - **Polling:** while any row `is_staging_pending`, interval refresh per `config.dataset_polling_interval`.
- Merge projects (`data-testid="merge-projects-button"`); modal `data-testid="merge-projects-modal"` — existing spec uses `project-search-autocomplete` result items.
- Delete project → `@update` navigates to `/projects`.
- **Edge:** Pagination visibility thresholds (`project-dataset-table.spec.js` intent once F1 fixed).

### 3.5 Create project (`/projects/new`)

- **CreateProjectStepper** — 4 steps: General Info → Datasets → Users → Create (`va-stepper`, `controlsHidden`; custom step buttons call `setStep` only if `isValid({ validate: true })`).
- **`isValid` gates:** step *n* requires: (0) `projectFormStore.form.isValid`, (1) `datasets.length > 0`, (2) `users.length > 0`; review step is informational.
- Controls: **Previous** / **Next**; last step button **Create Project** (`handleCreate` → `projectService.createProject` → `emit('update')` → parent `router.push('/projects')`).
- Store reset on `onUnmounted` of `projects/new.vue`.
- **Role:** `requiresRoles: ["operator", "admin"]`.

### 3.6 Dataset detail — global route (`/datasets/:datasetId`)

`Dataset.vue` is large; high-value UI behaviors:

- Loading and error states (invalid id).
- Info card + **Browse Files** disabled when `!dataset.num_files`.
- Conditional cards: archived path, staged path, MultiQC report link when `metadata.report_id` present.
- Actions: Stage / Delete archive / Download — button disabled/enabled matrix (`downloads` feature, `is_staged`, pending flags).
- Modals: stage confirm, delete archive confirm, download modal.
- Workflows section: `[data-testid="dataset-workflows-section"]`, `[data-testid="workflow-item"]` visible when data exists.
- **Polling:** `useIntervalFn(fetch_dataset, polling_interval)` while any workflow not done (`active_wf`); interval `config.dataset_polling_interval` or `null`.
- Genome browser / downloads gated by `auth.isFeatureEnabled` — align with `enabledFeatures`.
- **Role:** route requires operator/admin — `user` must not access.

### 3.7 Nested project dataset view (`/projects/:projectId/datasets/:datasetId`)

- Passes **`append-file-browser-url`** to `Dataset`; `navigateToFileBrowser` uses `route.path + "/filebrowser"` so browser opens **`/projects/:id/datasets/:datasetId/filebrowser`** (same `FileBrowser` page component under nested route — confirm route file exists or falls under parent; implementation uses `Dataset` prop).
- Nav stack: Projects → project name (link to slug) → dataset type label → dataset name (`ui.setTitle(project.name)` on success — note title is **project** name, not dataset).
- **Role:** `requiresRoles: ["operator", "admin"]`.

### 3.8 File browser (`/datasets/:datasetId/filebrowser`)

- Wrapper loads dataset (`workflows: false`), sets breadcrumbs: collection → dataset detail → “File Browser”.
- **FileBrowser** composable: `FileBrowserNav` (pwd) vs `FileBrowserSearchFilters` in search mode; `FileBrowserSearchBar`; `FileTable` with `showDownload` = `downloads` feature **and** `dataset.is_staged`.
- API: `datasetService.list_files`, `search_files` — needs **real files on dataset** for meaningful UI; smoke can assert toolbar + empty/error states only.
- **Role:** `requiresRoles: ["operator", "admin"]`.

### 3.9 Dataset collections — Raw data & data products (`/rawdata`, `/dataproducts`)

`DatasetList.vue` (`dtype` RAW_DATA vs DATA_PRODUCT):

- **Pinia `useDatasetStore`:** `filters`, `query`, `params`, `activeFilters`; URL persistence on `params` via `useQueryPersistence` key **`q`** (same key as projects list; different page).
- Search: debounced 300ms → `params.inclusive_query` → `DatasetService.getAll` with `name` filter.
- Table columns include optional **`num_genome_files`** when `auth.isFeatureEnabled('genomeBrowser')`.
- **Implementation note (2026-03-20):** `#cell(actions)` with Archive (`launch_wf` → `archive_dataset`) and Delete (`delete_dataset` soft_delete false) exists in the template, but the **`actions` column is commented out** in the `columns` array — those controls are **not rendered** in the current table. Do **not** write e2e for archive/delete from this list until a column is re-enabled; track as UI debt (**§6 F8**).
- Row links to `/datasets/:id` remain the primary navigation into dataset detail.
- **Edge:** Empty result set; filter + sort + page reset interactions (watchers reset page to 1).

### 3.10 Dashboard (`/dashboard`)

- Resource usage (`Storage`) loads.
- Raw data / data product stat cards link to `/rawdata`, `/dataproducts`.
- `Tasks` component lists active tasks; links from tasks to datasets (`Task.vue` router-link).

### 3.11 Workflows (`/workflows`)

- **Query persistence:** `useQueryPersistence` key **`wq`**, `history_push: false` (query **not** pushed to browser history).
- **Throttled** `getData` (500ms) loads workflows + status counts; watchers reset **`failure_mode`** to `null` on status/page change after fetch.
- **Search:** `watchDebounced` on `search_text` (500ms); `WorkflowSearchInputFilter` binds `search_by` + `search_text` (default search_by `dataset_name`).
- **Auto refresh:** `useIntervalFn` with `auto_refresh_msec`; **0 = Off** pauses interval; non-zero resumes.
- **Pagination:** hidden when `query_params.failure_mode != null` (failure mode is a **client-side filter** over current page results).
- **Filtered list:** `filtered_workflows` filters by `get_failure_mode` matching selected failure tab.
- **Edge:** `breakpoint_sm` (<768) vertical `va-tabs`.

### 3.12 Stats (`/stats`)

- Each chart section renders without fatal error (may be empty in ci data).
- **Edge:** API failure → toast or empty state (non-flaky assertions).

### 3.13 Alerts (`/alerts`)

- Search vs active filters UI branch.
- Filters modal; New Alert modal; table actions (view/edit/delete as implemented).
- Badges for type/status; hidden/visible column popovers.
- **Config:** `enabledFeatures.alerts` / runtime — sync with test config if role-gated later.

### 3.14 User management (`/users`)

Existing tests: create modal open, field visibility, cancel. **Additional** scenarios:

- List: search debounced; `forSelf: !auth.canOperate` on `UserService.getAll` (operators see all users); sort + “Reset Sort” pattern matches projects.
- **Edit:** pencil `disabled` when `!canEdit(rowData)` — `canEdit`: **admin** always; **self** always; else **only** users with role `user` or **no roles**; operators **cannot** edit other operators/admins (implicit `undefined` → falsy).
- **Spoof / “Log in as User”** (`v-if="auth.canAdmin"`): admin-only; opens sudo modal.
- Create vs modify paths; status / roles / validation in modal (`data-testid` fields already used in spec).
- **Role:** page `requiresRoles: ["operator", "admin"]`.

### 3.15 Profile (`/profile`)

- Read-only user fields match session.
- Role chips reflect JWT.
- Theme primary color change persists (`auth.setTheme`).

### 3.16 About (`/about`)

- Public read shows rendered HTML.
- **Role:** Edit button only `canAdmin || canOperate`; plain user read-only.
- Edit modal: mobile tab vs desktop layout (`ui.isMobileView`); cancel vs save; validation (`isValid`).

### 3.17 404 (`[...all]`)

- Unknown path shows friendly message and mailto link.

### 3.18 Downloads & secure flows (cross-cutting)

- Download modal on dataset: enabled when `downloads` feature and staging state allow.
- **Feature todo / out of scope:** full secure-download byte verification may need infrastructure beyond standard e2e — document when encountered.

---

## Appendix A — Deep component pass (code-trace summary)

Quick reference for **selectors**, **state keys**, and **branch conditions** trace-read from `ui/src` (2026-03-20). Excludes Import / Upload / Notifications UIs.

### A.1 Projects list (`pages/projects/index.vue`)

| Topic | Detail |
|--------|--------|
| API | `projectService.getAll` with `forSelf: !auth.canOperate` |
| Query persistence | `useQueryPersistence` on `params`, key **`q`**, `history_push: true` |
| Search debounce | 300ms (`useDebounceFn`) |
| Pagination watch | `currentPage` → fetch; changing `itemsPerPage` / `search` / sort → reset page to 1 |
| Columns | **users** + **actions** columns omitted when `!auth.canOperate`; **datasets** count column always |
| Row actions | Edit prefills `projectFormStore` + `EditProjectInfoModal`; delete opens `DeleteProjectModal` |

### A.2 Project detail & datasets table

| `data-testid` | Location |
|---------------|----------|
| `merge-projects-button` | `pages/projects/[projectId]/index.vue` |
| `merge-projects-modal` | `MergeProjectModal.vue` |
| `project-datasets-table` | `ProjectDatasetsTable.vue` |
| `project-datasets-pagination` | same |
| `project-search-autocomplete` | merge flow (see existing `project-merge-modal.spec.js`) |

**ProjectDatasetsTable** server query shape: `datasets_retrieval_query` merges filters, `skip`/`take`, `sortBy` object. Client-side row helpers: `is_staging_pending` ← `wfService.is_step_pending("VALIDATE", ...)`, `is_archival_pending` ← `"ARCHIVE"`.

### A.3 Create project stepper

| Step index | Label | `isValid` requirement |
|------------|-------|------------------------|
| 0 | General Info | `projectFormStore.form.isValid` |
| 1 | Datasets | + ≥1 dataset |
| 2 | Users | + ≥1 user |
| 3 | Create | review |

Step header click: `isValid({ validate: true }) && setStep(i)` — validation runs on step change when clicking completed step headers.

### A.4 `Dataset.vue` (detail shell)

| Control | Condition |
|---------|-----------|
| Browse Files | disabled if `!dataset.num_files` |
| Stage modal | button disabled if `is_stage_pending \|\| dataset.is_staged` |
| Delete archive | visible with `config.enable_delete_archive && dataset.archive_path`; confirm requires typing **exact dataset name** |
| Download | disabled if `!dataset.is_staged \|\| !auth.isFeatureEnabled('downloads')` |
| Genome file count in delete modal | only if `auth.isFeatureEnabled('genomeBrowser')` |
| Assoc datasets / audit logs | conditional on metadata |
| Workflows | collapsible; `fetch_dataset(true)` on `@update` from child `workflow` |

### A.5 Dataset routes — two shells

| Route | Component | Notes |
|-------|-----------|--------|
| `/datasets/:datasetId` | `pages/datasets/[datasetId]/index.vue` → `<Dataset>` | Sets nav from dataset type; `append-file-browser-url` **false** |
| `/projects/:slug/datasets/:datasetId` | nested `index.vue` → `<Dataset append-file-browser-url>` | File browser **relative** to current path |
| `/datasets/:id/filebrowser` | `FileBrowser` wrapper | `requiresRoles` operator+admin |
| `/projects/.../datasets/:id/filebrowser` | same `FileBrowser` | Route yaml has **title only** (no `requiresRoles`). Auth guard still requires login; **whether plain `user` may open this URL** should be verified — may differ from global `/datasets/:id/filebrowser` which lists `requiresRoles`. |

### A.6 Collections `DatasetList.vue`

| Topic | Detail |
|--------|--------|
| Store | `useDatasetStore` — shared filter/query state |
| URL key | **`q`** on `params` |
| `genomeBrowser` | extra column when feature enabled |
| Archive / delete row actions | **Not shown** — `actions` column commented out (see **F8**) |

### A.7 Dashboard

| Piece | Detail |
|--------|--------|
| Stats cards | `router-link` to `/rawdata`, `/dataproducts` |
| `Tasks` | `config.dashboard.active_tasks.steps` drives accordion groups; tasks link to dataset via `Task.vue` |

### A.8 Workflows page

| Topic | Detail |
|--------|--------|
| URL persistence | key **`wq`**, `history_push: false` |
| Status groups | Computed: ACTIVE = PENDING+STARTED; DONE = SUCCESS+FAILURE+REVOKED; EXCEPTION = FAILURE+REVOKED |
| Pagination | `v-if="query_params.failure_mode == null"` |
| Auto-refresh options | Off, 5s, 10s, 15s, 30s, 1m (`valueBy` seconds) |

### A.9 Alerts page

| Topic | Detail |
|--------|--------|
| Store | `useAlertStore` — `filters`, `query`, `params`, `activeFilters` |
| Search UX | When `activeFilters.length > 0`, main search hidden; `AlertSearchFilters` shown |
| `handleSearch` | debounced 500ms; resets page to 1 |
| Columns | Includes `actions` (view / edit) — fully wired unlike `DatasetList` |

### A.10 Stats page

Pure composition of chart components; no local `useQueryPersistence`. E2E: render smoke + network failure toast from child services (if any).

### A.11 About / Profile / Auth

| Page | Detail |
|------|--------|
| About | `aboutService.getLatest` on mount; edit uses markdown → HTML via `markdown-it` + `DOMPurify`; `useForm('aboutForm')` gates Save |
| Profile | All fields **readonly**; theme via `VaColorPalette` + `auth.setTheme` |
| Auth index | `data-testid="login-button"` on IU CAS button; other providers gated by `config.auth_enabled.*` |

### A.12 User list `canEdit` matrix (for operator-focused e2e)

| Viewer | Target user | Edit allowed? |
|--------|-------------|----------------|
| admin | anyone | yes |
| operator / admin | self | yes |
| operator | `user` role or empty roles | yes |
| operator | another operator/admin | **no** (button disabled) |

---

## 4. Role-gated & multi-role testing (TODO — design)

**Goal:** Run the **same** spec under multiple storage states (admin / operator / user) without duplicating files, and express role-specific expectations in one file when needed.

**Current `main` pattern:** Separate Playwright **projects** per role with `testMatch` / `testIgnore` (see `tests/playwright.config.js` import example and `tests/docs/role_gated_features.md`).

**Problems called out by stakeholders:**

1. Default `enabledForRoles` in UI often **admin-only** while product wants to assert behavior for all entitled roles.
2. Env-level sync (UI `features.js` vs `tests/src/utils/feature.js` vs compose env) must stay aligned when defaults or env names change.

**Candidate approaches (prefer containerized/local, not CI-only):**

| Approach | Idea | Pros | Cons |
|----------|------|------|------|
| **A. Scripted config swap** | Before run: patch `ui` + test config (or env-driven build args) to expand `enabledForRoles`; run suite; revert. | Full integration truth | Must be deterministic, git-clean, parallel-safe |
| **B. Dynamic role matrix in spec** | `test.use` or parameterized `test.describe` with fixture that logs in as role X; use `process.env.ROLE` from matrix | Single spec file | Still need matching feature flags per matrix row |
| **C. Playwright projects + same file** | Multiple projects, same `testMatch`, `storageState` per project; use `test.info().project.name` or env to branch assertions | Built-in | Assertion branching must stay readable |
| **D. globalSetup toggles** | `globalSetup` writes temp config or seeds feature flag overrides via API | Centralized | Needs API support for flags |

**Recommendation for follow-up spike:** Combine **C + API seed** where possible: keep one spec per feature; projects `admin_*`, `operator_*`, `user_*` attach storage state; use small helper `expectRole(page, roles)` for branched expectations. For **enabledForRoles** expansion, prefer **documented script** in `bin/` that temporarily aligns UI bundle config + `tests/config` + playwright excludes (as in docker changelog §7–8) **unless** we add a dedicated “e2e feature matrix” env read by UI at runtime.

**Also investigate:** Playwright `grep` tags / `--grep-invert` for slicing matrix runs.

### Feature roles in Playwright (design note)

**What people mean by “read from UI”:** Ideally Playwright would load the **already-resolved** `enabledForRoles` arrays from the same runtime object the browser uses, so project `testMatch` / `testIgnore` never drift from the bundle.

**Why that is awkward here:**

1. **`playwright.config.js` must export a plain object** (Playwright 1.43). It cannot be `async` and return a Promise, so you cannot `await fetch(...)` against the dev server inside the config file.
2. **`globalSetup` runs after config is loaded** — it cannot add or change the `projects` array.
3. **Calling the running app** from Node (HTTP or `curl`) is possible, but adds timing/curl/SSL coupling and still requires the UI to be up before `playwright test` parses config — brittle for `playwright test --list` and local runs without a stack.

**Current approach:** `tests/src/utils/feature.js` implements **`buildFeatureEnabledRolesFromEnv()`** with the **same env keys and precedence** as `ui/src/services/features.js`. Docker e2e sets those vars on **both** the UI and e2e services, so the **resolved lists match** without hitting HTTP.

**Future options** if we outgrow env mirroring: upgrade Playwright to a version that supports **async config**; or extract shared pure resolution into a small package with `getEnv(key)` injected from Vite vs Node; or a build step that writes a JSON artifact both sides read.

### Upload e2e layout & project ownership

- **Spec root:** `tests/src/tests/view/authenticated/upload/` (aligned with `import`; route under test is still `/datasetUpload/...`).
- **`admin_upload`** runs the bulk of upload specs but **ignores**:
  - `project_association/user_role/association.spec.js` (user-only project),
  - `project_dataset_access.spec.js` (per-role projects),
  - `project_association/non_user_roles/*.spec.js` (owned below).
- **`{admin,operator}_upload_project_association_non_user_roles`** — one Playwright project per role that has uploads; **same spec files**, different `storageState`. Avoids running those specs twice under `admin_upload` and again under a single operator project.
- **`user_upload_project_association`** — user-ticket login flow.
- **`{role}_upload_project_dataset_access`** — role matrix for autocomplete scoping; spec uses nested `describe` blocks (user vs admin/operator expectations).

**CI / pipeline:** align `VITE_FEATURE_ROLE_OVERRIDES` (and related `VITE_*` on ui + e2e) with `E2E_TARGET_ROLES` so `buildFeatureEnabledRolesFromEnv()` and the UI bundle agree; slice runs with `playwright test --project=...` or path `view/authenticated/upload/...` as needed.

---

## 5. API assertions policy (TODO)

**Issue:** Several specs assert **HTTP JSON** via `page.request` (e.g. project dataset table setup). True e2e should primarily assert **observable UI behavior**.

**Action items:**

- Audit each spec: classify assertions as **UI-observable**, **setup-only** (OK to keep API), or **redundant API contract check** (remove or move to API/integration suite).
- Prefer: API for **arrange**, UI for **act + assert**; avoid duplicating REST contract unless the UI has no stable hook.
- Update this section when conventions are finalized; align `e2e_testing_conventions.md` if policy changes.

---

## 6. Feature / infrastructure TODOs

| ID | Item |
|----|------|
| F1 | ✅ **Done (2026-03-20):** removed global `testIgnore` for project specs from `tests/playwright.config.js`. |
| F2 | ✅ **Done (2026-03-20):** changed unauthenticated `testMatch` to `/view/unauthenticated/*.spec.js`. |
| F3 | **In progress:** continue fixing/adding existing specs after discovery repair (first new specs added and validated; broader suite still pending). |
| F4 | ✅ **Implemented (2026-03-20):** Role-scoped CI execution + runtime feature-role overrides now use env (`E2E_TARGET_ROLES`, `E2E_SKIP_UNAUTHENTICATED`, `VITE_*_ENABLED_FOR_ROLES`). Playwright role routing no longer depends on duplicated `tests/config/default.json` feature-role lists. |
| F5 | **xenium** (`/Users/ripandey/dev/xenium`): review pipeline patterns only — stakeholder preference is **not** to solve role-matrix solely in CI. |
| F6 | Reconcile **`config.enabledFeatures.import` vs playwright `operator_import`**: UI default shows `import` admin-only; verify operator import projects match intentional product behavior. |
| F7 | Large features needing **data/worker** support (file browser body, full download pipeline): mark out-of-scope for first e2e wave or add smoke-only. |
| F8 | **`DatasetList`:** `#cell(actions)` (archive/delete) exists but **`actions` column is commented out** — row actions not visible; e2e should not assume archive-from-list; product may treat as bug or intentional. |
| F9 | **Nested project file browser route** (`projects/.../filebrowser.vue`): no `requiresRoles` in `<route>` — confirm intended parity with `/datasets/:id/filebrowser` (operator/admin only). |
| F10 | ✅ **Done (2026-03-20):** `ui/src/services/features.js` — `resolveEnabledFeatures`, env/JSON role resolution, `isFeatureEnabled`; `config.js` only declares booleans + `{ defaultRoles }`; auth store delegates to features service; removed from `utils.js`. |
| F11 | **Before merge:** Rebase/reconcile this branch with `origin/main` (or target branch). If other features land first (routes, feature flags, Playwright projects, compose env), **re-run `playwright test --list`**, fix project `testMatch` / skips, and re-validate docker e2e. Treat merge order as a gate for test maintenance on this branch. |
| F12 | **Deferred by branch ownership:** Upload/Import/Notifications specs should be migrated to the new metadata-driven unauthorized-route and sidebar-role matrix style in their own feature branches; do not refactor those suites in this branch beyond compatibility fixes. |
| F13 | **Post-merge follow-up (`origin/uploads-rewrite`)**: upload registration path in rewritten route still assumes `datasetService.create()` always returns a dataset object; after uploads-rewrite is merged, add null-safe handling for duplicate/create-conflict path before dereferencing `createdDataset.id` (return explicit 409 or equivalent contract). |
| F14 | **E2E failure follow-up bucket (from full docker run on 2026-03-27, excluding nav-guard + non_user no-association which were prioritized first):** `user_management.spec.js` cancel-modal (admin/operator), `project-dataset-table.spec.js` pagination (admin/operator), `project-merge-modal.spec.js` merge (admin/operator), `upload/file_selection_step.spec.js` hide-table-after-delete, `upload/initiate_upload.spec.js` progress-to-100, `upload/project_dataset_access.spec.js` user scoped raw-data list. |
| F15 | **Still-unfixed from latest targeted reruns (2026-03-27):** `view/authenticated/upload/project_association/non_user_roles/no_association.spec.js` (`upload-selected-files-table` not visible before metadata tracking), `view/authenticated/upload/project_association/user_role/association.spec.js` (`beforeAll` timeout while preparing upload flow), `view/authenticated/upload/project_association/user_role/project_required_when_available.spec.js` (`beforeAll` timeout while preparing upload flow). |
| F16 | **Docs (`docs/features/`)**: add a dedicated auto-create-project-on-dataset-creation feature document that captures full intended behavior, role gating, upload/import parity rules, server-side validation expectations, and edge cases (using current branch behavior and AI memory as source of truth). |
| F17 | **Playwright docs update**: mention and standardize `bin/run_containerized_e2e.sh` usage in the app’s Playwright testing docs at the primary execution section (avoid direct `npx playwright test` guidance for containerized runs). |
| F18 | **Containerized startup docs**: document the containerized startup lifecycle (deploy/reset/run scripts, dynamic host-port rewrites, role-env sync expectations) in the appropriate docs location tied to compose-defined test services. |
| F19 | **Test documentation debt**: expand docs describing test organization, role/project routing, and scenario inventory (what each suite covers and why), including notification/upload/project/sidebar/dataset role-specific structure. |
| F20 | **Attachment tracking strategy**: design and implement a better policy for generated E2E attachments/artifacts than broad `attachment*` gitignore patterns (targeted paths, retention policy, and deterministic cleanup). |
| F21 | **E2E JS JSDoc pass**: add concise JSDoc to shared E2E JavaScript helpers/utilities and high-reuse action APIs to improve readability/contracts without adding noise to trivial test bodies. |
| F22 | **Refactor**: move `gotoWithRetry` into a shared E2E helper module and update role-sidebar specs (and any future consumers) to import it instead of duplicating logic. |

---

## 7. Changelog

| Date | Change |
|------|--------|
| 2026-03-20 | Initial route map, scenario backlog (minus Import/Upload/Notifications), role-gated strategy notes, API assertion TODO, infra issues (project/unauthenticated). |
| 2026-03-20 | **Pass 2:** Appendix A (component/trace tables); expanded §3.3–3.11, 3.14; `DatasetList` archive/delete UI note + **F8**; nested file browser + **F9** (`requiresRoles` parity); projects `forSelf` / datasets table role behavior. |
| 2026-03-20 | **Implementation start:** fixed Playwright project discovery (F1/F2), added `project-navigation.spec.js` and `navigation_guard_redirect.spec.js` (includes unauth deep-link redirect + public `/about`, project shell/create/nested dataset navigation), and validated targeted run (`unauthenticated` + `project` projects, `TEST_BASE_URL=https://localhost:24443`) with **5 passing + 1 conditional skip** (seeded project had no dataset links in one run). |
| 2026-03-20 | Added CI role-matrix groundwork: role-scoped project selection in `tests/playwright.config.js`, import role-gated project generation from test config, new npm scripts (`test:role:*`, `test:authenticated`), and updated role-gated docs with matrix env usage. |
| 2026-03-20 | Removed feature-role duplication between UI and tests: `ui/src/config.js` now supports env-driven `enabledForRoles` (`VITE_*_ENABLED_FOR_ROLES`), Playwright reads the same env values for role routing, `tests/config/default.json` no longer carries feature-role lists, and `project_dataset_access.spec.js` was refactored to run one role per project (`*_upload_project_dataset_access`) instead of handling all roles in one test process. |
| 2026-03-20 | Added compose-level env propagation for role-gated UI flags (`docker-compose-e2e.yml` ui + e2e services) so CI jobs can select feature-role sets at startup; verified project routing with `playwright --list` for admin/operator/user and for uploads-enabled matrix overrides. |
| 2026-03-20 | Simplified role-gated env wiring to one variable (`VITE_FEATURE_ROLE_OVERRIDES` JSON) consumed by both `ui/src/config.js` and `tests/playwright.config.js` (per-feature `VITE_*_ENABLED_FOR_ROLES` still used when JSON does not define that feature or when overrides are disallowed). Added additional multi-role routing for existing role-agnostic specs (`operator_project`, `operator_upload_project_association_non_user_roles`). |
| 2026-03-20 | Renamed `legacyEnvVarName` to `rolesListEnvVar` in UI + Playwright (per-feature comma-separated role envs are the non-JSON tuning path, not “legacy”). Documented production safety for `docker-compose-prod.yml` + `builddev` (`vite build --watch`) in `tests/docs/role_gated_features.md`. |
| 2026-03-20 | **F10:** UI feature flags consolidated in `ui/src/services/features.js`; `config.enabledFeatures` spec is boolean or `{ defaultRoles }` only; `isFeatureEnabled` removed from `utils.js`. |
| 2026-03-20 | Playwright: deduplicated role-scoped projects via loops (`${role}_project`, `${role}_notifications`, `${role}_user_management`, `${role}_sidebar_non_user`); `makeRoleProject` sets `metadata.e2eRole`; renamed `project`→`admin_project`, `upload`→`admin_upload`, user association project→`user_upload_project_association` with normal login deps; `project_dataset_access` resolves role from metadata. |
| 2026-03-20 | Storage paths moved to `tests/playwright.paths.js`; feature-role lists for Playwright from **`buildFeatureEnabledRolesFromEnv()`** (`tests/src/utils/feature.js`, same `VITE_*` env as UI). §4 “Feature roles in Playwright” explains why config does not HTTP-fetch the running UI; **F11** = reconcile tests vs merge order before landing branch. |
| 2026-03-21 | Upload e2e moved to **`tests/src/tests/features/upload/`**; `admin_upload` no longer includes `non_user_roles` (owned by `{admin,operator}_upload_project_association_non_user_roles`); `project_dataset_access.spec.js` split into nested describes (user vs admin/operator). §4 “Upload e2e layout & project ownership” documents pipeline alignment. |
| 2026-03-20 | Upload e2e specs moved to **`tests/src/tests/view/authenticated/upload/`** so upload and import share the same authenticated view-level hierarchy. Playwright `testMatch` paths were updated to `/view/authenticated/upload/...`, and relative imports in moved specs were adjusted accordingly. |
| 2026-03-21 | Added metadata-driven route coverage foundation: unauthenticated nav-guard spec now iterates router-derived protected views, duplicate `view/unauthenticated/project.spec.js` removed, sidebar specs expanded to visibility + route visit + direct-URL unauthorized checks, and default layout now shows a shared authorization alert (`data-testid=role-authorization-alert`) instead of blank role-denied pages. Unauthenticated project runs now fan out as `${role}_unauthenticated` to keep role-matrix parity. |
| 2026-03-21 | Auto-project behavior tightened for dataset creation: user-role clients must pick an existing Project when one is available (upload+import steppers), API now enforces that same user-only rule server-side, and API auto-create eligibility is now configurable via `auto_create_project_on_dataset_creation_roles` (default `["user"]`) instead of hardcoded role checks. Added upload/import e2e coverage for required-project and import auto-create flows under user role projects. |
| 2026-03-28 | Added new documentation/refactor backlog entries (**F16–F22**) covering auto-create feature docs, Playwright runner docs (`bin/run_containerized_e2e.sh`), containerized startup docs, scenario/test-organization docs, attachment-tracking redesign, JSDoc coverage for shared E2E JS utilities, and shared `gotoWithRetry` helper extraction. |
| 2026-03-28 | Full containerized suite revalidated after merge-reconciliation and flaky-hook hardening. Latest stable run used `bin/run_containerized_e2e.sh -- --workers=1` with **129 passed / 10 skipped / 0 failed**. Skips were runtime-conditional (role-gated branch skips in `project_dataset_access.spec.js`, plus import-directory availability skips in select-directory/next-previous flows), not assertion failures. |

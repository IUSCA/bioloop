# E2E test inventory

What each spec (and its tests) is meant to verify. **Exact Playwright project × test lines** depend on `E2E_TARGET_ROLES` and feature env (`VITE_FEATURE_ROLE_OVERRIDES`, etc.); regenerate the flat list with:

```bash
cd tests && npx playwright test --list
```

**Related:** role gating and upload layout — [role_gated_features.md](./role_gated_features.md), `.ai/features/e2e_suite.md` §4.

---

## Setup (not “product” tests)

| File | Tests | What they do |
|------|--------|----------------|
| `src/tests/setup/admin_login.setup.js` | `login` | CAS ticket `admin`; saves `storageState` for admin projects. |
| `src/tests/setup/operator_login.setup.js` | `login` | CAS ticket `operator`; saves operator `storageState`. |
| `src/tests/setup/user_login.setup.js` | `login` | CAS ticket `user`; saves user `storageState`. |

---

## Unauthenticated

| File | Tests | What they do |
|------|--------|----------------|
| `view/unauthenticated/navigation_guard_redirect.spec.js` | `deep link redirects to login with redirect_to query` | Visiting a protected URL while logged out sends user through auth with `redirect_to` preserved (via `URL` / `searchParams`). |
| | `about page is public` | `/about` loads without login. |
| `view/unauthenticated/project.spec.js` | `redirects to navigation guard` | Unauthenticated access to `/projects` hits login / guard behavior. |

---

## Sidebar (role-specific projects)

| File | Tests | What they do |
|------|--------|----------------|
| `view/authenticated/sidebar/non_user_role_sidebar_view.spec.js` | `sidebar items visible` | After login as **admin/operator**: Projects + **User management** sidebar entries visible (`/`). |
| `view/authenticated/sidebar/user_role_sidebar_view.spec.js` | `sidebar items visible` | After login as **user**: Projects visible; **User management** hidden. |

---

## Notifications

**Project routing:** `*_notifications` runs either `non_user_role_notifications.spec.js` or `user_role_notifications.spec.js` depending on whether that role is in the notifications allow-list (same rules as UI `enabledFeatures.notifications`).

| File | Tests | What they do |
|------|--------|----------------|
| `view/authenticated/notifications/user_role_notifications.spec.js` | `Notification menu not visible` | Header notification icon **not** shown when notifications are off for that role. |
| `view/authenticated/notifications/non_user_role_notifications.spec.js` | `No notifications exist` | Badge empty; menu shows “No pending notifications”. |
| | `Notification created` | API-created notifications appear in badge count and menu rows (`data-testid` per notification). |

---

## User management (`/users`)

Runs under **`admin_user_management`** and **`operator_user_management`** (same spec, different sessions).

| File | Tests | What they do |
|------|--------|----------------|
| `view/authenticated/userManagement/user_management.spec.js` | `Create User modal opened` | Open create-user modal; modal fields exist and start empty. |
| | `Cancel Modal action taken` | Fill fields, cancel, reopen — fields reset. |
| | `User created` | Submit valid user; modal resets for next create. |

---

## Project views

Runs under **`admin_project`** and **`operator_project`** (seeded project id in specs).

| File | Tests | What they do |
|------|--------|----------------|
| `view/authenticated/project/project-dataset-table.spec.js` | `Pagination` | Project datasets table: clear datasets via API, add one, pagination / page size UI behaves. |
| `view/authenticated/project/project-merge-modal.spec.js` | `Project Merge` | Merge modal opens; project search autocomplete finds merge target by partial name. |
| `view/authenticated/project/project-navigation.spec.js` | `projects index can navigate to create-project flow` | `/projects` → Create Project → `/projects/new` + General Info. |
| | `project details renders key sections and merge modal` | Fixed project id: General Info, Associated Datasets, Maintenance, datasets table, merge button opens modal. |
| | `project datasets table links to nested dataset route` | First dataset link navigates to nested `/projects/.../datasets/...` (skips if no rows). |

---

## Dataset import (`/datasets/import`)

**Admin (or any role in import allow-list):** full suite under `admin_import` (etc.). **Operator/user without import:** only `access_control.spec.js`.

| File | Tests | What they do |
|------|--------|----------------|
| `view/authenticated/import/access_control.spec.js` | `should show a disabled-feature warning...` | `/datasets/import` shows “feature disabled” alert instead of stepper. |
| `view/authenticated/import/navigation.spec.js` | four tests | Stepper visible at route; three step buttons; Import Source dropdown; path typeahead. |
| `view/authenticated/import/steps.spec.js` | two tests | Step button labels; only Select Directory enabled on load. |
| `view/authenticated/import/select_directory_step.spec.js` | many tests | Import source dropdown, auto-select, dataset path typeahead, badge, Next disabled until directory, switch source resets search, typeahead lists dirs, filter, Next enabled, validation error on Next without selection, error clears on select. |
| `view/authenticated/import/next_previous_buttons.spec.js` | nested tests | Prev/Next disabled on load; Next enables after directory; on General Info Prev on / Next off until fields filled. |
| `view/authenticated/import/general_info_step.spec.js` | setup + field tests | Reach General Info after directory; field defaults; select/clear; disabling raw data / project / instrument when type or checkboxes change. |
| `view/authenticated/import/import_details_step.spec.js` | setup + field tests | Reach Import Details; card visible; dataset name validation (empty, short, spaces); Next enable; Previous back to General Info. |
| `view/authenticated/import/initiate_import.spec.js` | workflow tests | End-to-end: directory → General Info (optional fields off) → Import Details → Import → success toast, dataset link, navigate to dataset / workflow UI. |

---

## Dataset upload (`/datasetUpload/...`)

Specs live under **`src/tests/features/upload/`**. **`admin_upload`** runs most files; **`{admin,operator}_upload_project_association_non_user_roles`** runs `project_association/non_user_roles/*` only; **`user_upload_project_association`** runs user CAS flow when uploads allow user; **`{role}_upload_project_dataset_access`** runs autocomplete scoping tests per role.

| File | Tests | What they do |
|------|--------|----------------|
| `features/upload/navigation.spec.js` | `should navigate to upload page` | Reach new upload flow. |
| `features/upload/file_selection_step.spec.js` | four tests | Select files, table count, delete files, hide table when empty. |
| `features/upload/general_info_step.spec.js` | seven tests | General Info defaults, select/clear fields, disable+clear linked fields when dataset type / checkboxes change. |
| `features/upload/next_previous_buttons.spec.js` | five tests | Stepper Prev/Next states across file selection and General Info; Next disabled if required associations cleared. |
| `features/upload/steps.spec.js` | five tests | Step sidebar labels and which steps are enabled per phase (files → general → upload details). |
| `features/upload/initiate_upload.spec.js` | three tests | After upload click: Processing → Uploading → per-file progress to 100%. |
| `features/upload/upload_details_step/with_metadata.spec.js` | four tests | Table visible; fill general info; Upload Details shows chosen metadata + file list. |
| `features/upload/upload_details_step/without_metadata.spec.js` | three tests | Same flow with optional metadata path trimmed (details show fields without full metadata branch). |
| `features/upload/project_association/non_user_roles/association.spec.js` | one main test | Full flow with project selected: upload completes; dataset links to chosen project. |
| `features/upload/project_association/non_user_roles/no_association.spec.js` | one main test | Upload without assigning project; dataset not tied to a project. |
| `features/upload/project_association/user_role/association.spec.js` | `should create a new Project` | **Synthetic user** (API): upload without project assignment; UI creates project; new tab project page lists dataset. |
| `features/upload/project_dataset_access.spec.js` | **User role** block (2 tests) | Source Raw Data autocomplete **only** datasets on assigned project; Project autocomplete **only** that project. |
| | **Admin or operator** block (2 tests) | Autocomplete includes datasets **outside** test project; project list includes **multiple** projects. *(Per project, one block is skipped.)* |

---

## Optional / env-dependent projects

These **do not** appear in `playwright test --list` unless `buildFeatureEnabledRolesFromEnv()` and `E2E_TARGET_ROLES` include the right roles:

- **`user_upload_project_association`** — uploads enabled for `user`.
- **`operator_upload_project_association_non_user_roles`** — uploads enabled for `operator`.
- **`{role}_upload_project_dataset_access`** for operator/user — uploads enabled for that role.
- **`non_user_role_notifications.spec.js`** — notifications enabled for that role (replaces `user_role_notifications` for that project).

---

## Maintenance

When adding or renaming tests, update this file or run `--list` and reconcile sections. For upload/import project wiring, update `.ai/features/e2e_suite.md` **Upload e2e layout** if ownership changes.

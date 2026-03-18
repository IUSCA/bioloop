## Summary

This PR introduces the **Dataset Import** feature and its complete **E2E test suite**.

The import feature lets admins (and optionally operators) browse configured
filesystem import sources, select a directory, fill in dataset metadata, and
initiate an import workflow — all through a guided stepper UI.

The E2E tests are a ground-up rewrite of the existing import specs, which made
direct API calls and asserted on API response data rather than on the DOM.  The
new tests follow the same DOM-only philosophy as the rest of the test suite.

---

## What changed and why

### 1 — Database & API: import sources

The import feature needs to know which filesystem paths are valid sources.
These are now stored in a new `import_source` table rather than hardcoded in
config.

| File | Change |
|---|---|
| `api/prisma/migrations/…/migration.sql` | Creates the `import_source` table (`path`, `label`, `description`, `sort_order`) |
| `api/prisma/schema.prisma` | Adds the `import_source` model |
| `api/prisma/seed.js` | Seeds two default import sources for docker/dev |
| `api/src/routes/datasets/imports.js` | `GET /datasets/imports/sources` — returns ordered import sources |
| `api/src/routes/datasets/index.js` | Registers the new imports router |
| `api/src/routes/fs.js` | Filesystem path-search endpoint used by the file typeahead |
| `api/src/routes/index.js` | Registers the fs router |
| `api/src/services/accesscontrols.js` | Adds `import_sources` resource with `read` permission |
| `api/src/services/dataset.js` | Import-initiation logic |
| `api/src/utils/index.js` | Shared utility additions |
| `api/src/scripts/init_prod_import_sources.js` | One-time production seed script for import sources |
| `api/src/scripts/init_prod_users.js` | Related production user init adjustments |
| `api/config/default.json` | Default config values for imports |
| `api/config/custom-environment-variables.json` | Env var mappings for import config |
| `api/.env.default` | Documents new import-related env vars |

### 2 — UI: import stepper

A guided three-step stepper that walks the user through selecting a directory,
filling in general metadata, and reviewing/confirming import details.  The
feature is role-gated (see `ui/src/config.js`).

| File | Change |
|---|---|
| `ui/src/components/dataset/import/ImportStepper.vue` | Core stepper — import source dropdown, file path typeahead, general info form, import details step, step validation, navigation buttons.  Also received `data-testid` attributes throughout for e2e test targeting. |
| `ui/src/components/dataset/import/FileListAutoComplete.vue` | Wraps the generic autocomplete for filesystem path browsing; gained a `dataTestId` prop so the e2e tests can target it by ID. |
| `ui/src/components/dataset/import/ImportInfo.vue` | Displays a read-only summary of the pending import; gained a `data-testid` on its root card. |
| `ui/src/services/import.js` | API service for import endpoints |
| `ui/src/services/fs.js` | API service for the filesystem search endpoint |
| `ui/src/config.js` | Adds `import` to `enabledFeatures` with `enabledForRoles: ["admin", "operator"]` |
| `ui/.env.default` | Documents new import-related UI env vars |

### 3 — Workers: test data & directory setup

Workers need import source directories to exist on disk, and the e2e environment
needs pre-populated sample datasets to browse.

| File | Change |
|---|---|
| `workers/bin/init_dirs.sh` | Creates the configured import source directories on startup |
| `workers/bin/create_test_import_datasets.sh` | **New.** Creates small sample dataset directories inside each import source so the import UI has real content in docker/dev/e2e environments |
| `workers/workers/config/__init__.py` | Adds import source paths to the worker config |
| `workers/ecosystem.config.js` | Adds the `create_test_import_datasets` one-shot process |

### 4 — E2E tests: full rewrite

The previous import test files (`import_sources.spec.js`, `import_stepper.spec.js`)
asserted against raw API response data, not the DOM.  They have been replaced
with seven focused spec files, each covering a distinct part of the import UI.

**Deleted (replaced):**
- `tests/src/tests/view/authenticated/import/import_sources.spec.js`
- `tests/src/tests/view/authenticated/import/import_stepper.spec.js`

**New spec files:**

| File | What it tests |
|---|---|
| `navigation.spec.js` | Page renders at `/datasets/import`, stepper is present, import source dropdown and file typeahead are visible |
| `steps.spec.js` | All three step buttons render with the correct labels |
| `next_previous_buttons.spec.js` | Next/Previous enabled-disabled states across all steps |
| `select_directory_step.spec.js` | Import source dropdown, file typeahead open/close, source switching, directory selection, error on empty submit, **search result filtering** (all visible results contain the search term) |
| `general_info_step.spec.js` | All General Info form fields render, respond to input, and interact correctly (dependent dropdowns, checkbox-driven fields) |
| `import_details_step.spec.js` | Dataset name input validation (min length, forbidden chars, uniqueness), Next gating |
| `access_control.spec.js` | Roles without import access see the "feature disabled" alert instead of the stepper |

### 5 — E2E test infrastructure

Supporting changes that make the test suite run reliably in an isolated Docker
Compose environment.

**Playwright config & test config:**

| File | Change |
|---|---|
| `tests/playwright.config.js` | Adds `admin_import`, `operator_import`, `user_import` projects with the role-gated project layout (functional tests vs access-control check — see block comment in file) |
| `tests/config/default.json` | Adds `import` feature flag to mirror `ui/src/config.js` |
| `tests/config/custom-environment-variables.json` | Maps `TEST_BASE_URL` env var to `config.baseURL` |
| `tests/.env.default` | Sets `TEST_BASE_URL` to the e2e stack's remapped UI port |
| `tests/src/constants.js` | **New.** Exports `FEATURE_ROLE_SYNC_NOTE` — a detailed description of the three-way sync requirement for role-gated features, used as a skip/fail message in access control specs |

**Shared test actions:**

| File | Change |
|---|---|
| `tests/src/actions/index.js` | Fixes `selectAutocompleteResult` to correctly handle `resultIndex: 0`; adds `getAutoCompleteResults` |
| `tests/src/actions/stepper.js` | Generalises `navigateToNextStep` / `navigateToPreviousStep` to accept a custom button test ID (previously hardcoded to upload) |

**Login setup (timing):**

| File | Change |
|---|---|
| `tests/src/tests/setup/admin_login.setup.js` | Increases `toContainText` timeout to 20 s for cold Docker starts |
| `tests/src/tests/setup/operator_login.setup.js` | Same |
| `tests/src/tests/setup/user_login.setup.js` | Same |

**Docker Compose e2e stack:**

| File | Change |
|---|---|
| `docker-compose-e2e.yml` | Overhauled: all host ports remapped to a unique `13xxx` range (avoids conflicts with the main stack), UI healthcheck added so the `e2e` container waits for the UI to be ready, `init_test_data` service added to populate sample import datasets before tests start, volume and healthcheck settings synced with `docker-compose.yml` |
| `docker-compose.yml` | Minor fixes carried across to keep the two files consistent |
| `api/bin/entrypoint.sh` | Handles `NODE_ENV=ci` for test-user authentication bypass |
| `bin/deploy_containerized_e2e.sh` | **New.** Deploy script for the e2e stack (mirrors `deploy_containerized.sh` but targets `docker-compose-e2e.yml` and the e2e project name) |
| `bin/reset_docker_e2e.sh` | **New.** Reset script for the e2e stack — stops containers, removes volumes, clears generated credentials, **and also removes Playwright auth state** (`tests/.auth/`) so login sessions are re-created after a DB reset |

**Docs:**

| File | Change |
|---|---|
| `tests/docs/authentication.md` | Adds "Role-Gated Features" section: the three-way sync requirement, the project layout pattern, the `access_control.spec.js` template, and step-by-step instructions for adding/removing a role from a feature |

---

## Checklist

- [ ] Code passes linting (`npm run lint` in `ui/` and `api/`)
- [ ] `docker-compose.yml` and `docker-compose-e2e.yml` are in sync for all shared services
- [ ] `ui/src/config.js` `enabledForRoles` and `tests/config/default.json` `enabledForRoles` match for every feature
- [ ] Production import sources have been seeded via `api/src/scripts/init_prod_import_sources.js`
- [ ] Reviewed own code and resolved any merge conflicts
- [ ] Requested a review from at least one team member

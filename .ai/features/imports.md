# Import Feature Changelog

## 2026-03-17

- Decision: Replaced hardcoded filesystem "search spaces" (config-driven, denylist model) with a DB-backed `import_source` table (allowlist model).
- Decision: New `import_source` table with columns: `id`, `path`, `label`, `description`, `sort_order`, `owner_id`, `created_at`, `updated_at`, `metadata`. Path is unique. `sort_order` nulls sort last, then alphabetical by label.
- Decision: Migration added at `api/prisma/migrations/20260303_add_import_sources/migration.sql`.
- Decision: New API route `GET /datasets/imports/sources` added at `api/src/routes/datasets/imports.js`, registered before `/datasets` in `api/src/routes/index.js` to avoid Express `:datasetId` capture.
- Decision: ACL resource `import_sources` with `read:any` granted to all three roles (admin, operator, user).
- Decision: `api/src/routes/fs.js` fully replaced. New design: client sends full path; server finds the matching import source by prefix lookup (allowlist check). No client-supplied import source ID. Path traversal neutralized by `path.resolve()` before prefix check. Path translation (canonical path → local mount point) is now DB-driven via `import_source.mounted_path`; no env vars required. When `mounted_path` is null the API reads from `path` directly.
- Decision: Bug fix for filesystem typeahead: when exact path not found, falls back to case-insensitive substring match in the parent directory. Matching directories are returned. This fixes the case where partial directory names did not surface results.
- Decision: `POST /datasets` origin_path validation changed from denylist (picomatch glob check against `restricted_import_dirs`) to allowlist (check that `decoded_origin_path` falls within a configured import source). Only applies when `create_method === IMPORT`.
- Decision: `picomatch` import removed from `api/src/routes/datasets/index.js` (no longer used).
- Decision: `import_space` field removed from `req.body` destructuring in `POST /datasets`.
- Decision: Removed `filesystem_search_spaces`, `filesystem.search_spaces`, and `restricted_import_dirs` from `api/config/default.json` and `api/config/custom-environment-variables.json`. Removed corresponding env vars from `api/.env.default`.
- Decision: Seed script (`api/prisma/seed.js`) now seeds two default import sources for non-production environments (Imports and Project paths).
- Decision: Production init script `api/src/scripts/init_prod_import_sources.js` reads import sources from `api/import_sources.json` (array of `{ path, label, description, sort_order, mounted_path }` objects). Upserts on `path`; idempotent. `mounted_path` is optional — set it only when the filesystem is mounted at a different path than the canonical `path`.
- Decision: `api/src/scripts/init_prod_data.js` is the canonical production data initialization entry point. Runs user init and/or import-source init. Flags: `--init-users` / `-u`, `--init-import-sources` / `-i`. No flags runs both. Both underlying scripts are idempotent.
- Decision: New UI service `ui/src/services/import.js` with `getSources()` and `_getLabel(source)` methods.
- Decision: `ui/src/services/fs.js` `getPathFiles` method no longer accepts or sends `search_space` param.
- Decision: `ui/src/config.js` no longer contains `filesystem_search_spaces` or `restricted_import_dirs`. Removed corresponding VITE env vars from `ui/.env.default`.
- Decision: `ImportStepper.vue` refactored to load import sources from API on mount. `searchSpace` ref replaced by `selectedImportSource` ref. `FILESYSTEM_SEARCH_SPACES` constant removed. `getRestrictedImportPaths` function removed. Step 0 form validation simplified to a null-check only (no restricted path check — server enforces allowlist). `import_space` removed from `importFormData`. Template uses `importService._getLabel` for display.
- Constraint: CMG-specific fields (genome_type, genome_value, import_notes, analysis_type, source_data_product_id) were intentionally NOT ported. This changelog only reflects platform-generic changes.

## TODO

- Remove outdated `.env` properties from production instances: `FILESYSTEM_SEARCH_SPACES`, `SCRATCH_IMPORT_RESTRICTED_DIRS`, `VITE_SCRATCH_*`, `VITE_PROJECT_*`, `VITE_FILESYSTEM_SEARCH_SPACES`.

### E2E Test Quality: API-assertion tests to rewrite as DOM-based

During the import e2e rewrite, existing tests outside the import directory were audited. The following spec files contain assertions against API response data (not DOM elements) and should be converted to DOM-only assertions:

- `tests/src/tests/view/authenticated/upload/project_association/non_user_roles/no_association.spec.js`
  - **Test**: `should not associate the uploaded Dataset with any Project`
  - **Issue**: Calls `getDatasets()` API helper, parses `response.json()`, and asserts `expect(matching_dataset.projects).toHaveLength(0)` directly on the API response body.
  - **Fix**: After completing the upload UI flow, navigate to the uploaded dataset's detail page (or the datasets list) and assert that the project association section shows no linked projects in the DOM — consistent with how `association.spec.js` verifies linked projects via `projectLink.getAttribute('href')`.

All other tested spec files (sidebar, notifications, project, upload, userManagement, unauthenticated) assert exclusively on DOM elements and are compliant with the DOM-based testing philosophy.

## 2026-03-17 (E2E Tests)

- Decision: Both prior API-based test files (`import_sources.spec.js`, `import_stepper.spec.js`) deleted and replaced with DOM-based spec files following the pattern established in `upload/` and `userManagement/` tests.
- Decision: New test files in `tests/src/tests/view/authenticated/import/`:
  - `navigation.spec.js` — page renders at `/datasets/import`, step buttons and key controls are visible.
  - `steps.spec.js` — step button labels and enable/disable states.
  - `next_previous_buttons.spec.js` — Next/Previous button states across all three steps.
  - `select_directory_step.spec.js` — import source dropdown (open, options, switch), file typeahead (open, select, error message).
  - `general_info_step.spec.js` — General Info form fields (defaults, selecting values, clearing, checkbox/field interdependencies).
  - `import_details_step.spec.js` — Import Details step (dataset name input, validation errors, Next enable/disable, back navigation).
- Decision: `tests/src/actions/stepper.js` generalized — `navigateToNextStep` and `navigateToPreviousStep` now accept optional `nextButtonTestId` / `previousButtonTestId` params; default remains `upload-next-button` / `upload-previous-button` for backward compatibility.
- Decision: `ui/src/components/dataset/import/FileListAutoComplete.vue` — `dataTestId` prop added (default `'file-list-autocomplete'`), forwarded to `AutoComplete` so tests can target the input and results list by testId.
- Decision: `ui/src/components/dataset/import/ImportStepper.vue` — `data-testid` attributes added to all interactive elements: step buttons (`step-button-{i}`, `step-label`), import source select (`import-source-select`), file typeahead (`import-file-autocomplete`), error container (`import-source-error`), all General Info form fields (`import-metadata-*`), navigation buttons (`import-previous-button`, `import-next-button`).
- Decision: `tests/playwright.config.js` — `operator_import` and `user_import` projects added, each running `navigation.spec.js` to verify all three roles can reach and render the import page.
- Constraint: Tests that select a directory (`select_directory_step.spec.js`, `next_previous_buttons.spec.js`, `general_info_step.spec.js`, `import_details_step.spec.js`) use `test.skip` when no directories are found under the configured import sources. The test import dataset script (`workers/bin/create_test_import_datasets.sh`) must run before these tests to populate the import source directories.

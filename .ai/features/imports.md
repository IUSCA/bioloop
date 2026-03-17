# Import Feature Changelog

## 2026-03-17

- Decision: Replaced hardcoded filesystem "search spaces" (config-driven, denylist model) with a DB-backed `import_source` table (allowlist model).
- Decision: New `import_source` table with columns: `id`, `path`, `label`, `description`, `sort_order`, `owner_id`, `created_at`, `updated_at`, `metadata`. Path is unique. `sort_order` nulls sort last, then alphabetical by label.
- Decision: Migration added at `api/prisma/migrations/20260303_add_import_sources/migration.sql`.
- Decision: New API route `GET /datasets/imports/sources` added at `api/src/routes/datasets/imports.js`, registered before `/datasets` in `api/src/routes/index.js` to avoid Express `:datasetId` capture.
- Decision: ACL resource `import_sources` with `read:any` granted to all three roles (admin, operator, user).
- Decision: `api/src/routes/fs.js` fully replaced. New design: client sends full path; server finds the matching import source by prefix lookup (allowlist check). No client-supplied import source ID. Path traversal neutralized by `path.resolve()` before prefix check. Docker volume-mount path translation still uses `FILESYSTEM_BASE_DIR_*` / `FILESYSTEM_MOUNT_DIR_*` env vars.
- Decision: Bug fix for filesystem typeahead: when exact path not found, falls back to case-insensitive substring match in the parent directory. Matching directories are returned. This fixes the case where partial directory names did not surface results.
- Decision: `POST /datasets` origin_path validation changed from denylist (picomatch glob check against `restricted_import_dirs`) to allowlist (check that `decoded_origin_path` falls within a configured import source). Only applies when `create_method === IMPORT`.
- Decision: `picomatch` import removed from `api/src/routes/datasets/index.js` (no longer used).
- Decision: `import_space` field removed from `req.body` destructuring in `POST /datasets`.
- Decision: Removed `filesystem_search_spaces`, `filesystem.search_spaces`, and `restricted_import_dirs` from `api/config/default.json` and `api/config/custom-environment-variables.json`. Removed corresponding env vars from `api/.env.default`.
- Decision: Seed script (`api/prisma/seed.js`) now seeds two default import sources for non-production environments (Imports and Project paths).
- Decision: Production init script `api/src/scripts/init_prod_import_sources.js` reads import sources from `api/import_sources.json` (array of `{ path, label, description, sort_order }` objects). Upserts on `path`; idempotent.
- Decision: `bin/init_prod_data.sh` is the canonical production data initialization entry point. Runs user init and/or import-source init. Flags: `--init-users` / `-u`, `--init-import-sources` / `-i`. No flags runs both. Both underlying scripts are idempotent.
- Decision: New UI service `ui/src/services/import.js` with `getSources()` and `_getLabel(source)` methods.
- Decision: `ui/src/services/fs.js` `getPathFiles` method no longer accepts or sends `search_space` param.
- Decision: `ui/src/config.js` no longer contains `filesystem_search_spaces` or `restricted_import_dirs`. Removed corresponding VITE env vars from `ui/.env.default`.
- Decision: `ImportStepper.vue` refactored to load import sources from API on mount. `searchSpace` ref replaced by `selectedImportSource` ref. `FILESYSTEM_SEARCH_SPACES` constant removed. `getRestrictedImportPaths` function removed. Step 0 form validation simplified to a null-check only (no restricted path check — server enforces allowlist). `import_space` removed from `importFormData`. Template uses `importService._getLabel` for display.
- Constraint: CMG-specific fields (genome_type, genome_value, import_notes, analysis_type, source_data_product_id) were intentionally NOT ported. This changelog only reflects platform-generic changes.

## TODO

- Remove outdated `.env` properties from production instances: `FILESYSTEM_SEARCH_SPACES`, `SCRATCH_IMPORT_RESTRICTED_DIRS`, `VITE_SCRATCH_*`, `VITE_PROJECT_*`, `VITE_FILESYSTEM_SEARCH_SPACES`.

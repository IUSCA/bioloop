# Uploads Feature Rewrite — Pre-PR Checklist & Decisions

**Feature:** TUS-based resumable uploads replacing old chunk-upload implementation  
**Branch:** `uploads-rewrite---pr-feedback`  
**Last Updated:** 2026-03-12

---

## Pre-PR Checklist

> Canonical source also lives in `docs/design/upload-rewrite-notes.md`.

### Blocking (must fix before merge)

- [ ] **Multi-file upload bug** — `/complete` endpoint only moves the last file. Must accept all `process_ids` and move every file to `origin_path`. Both API and UI changes required.
- [ ] **`api/package-lock.json` not committed** — `@tus/file-store`, `@tus/server`, `ioredis` are in `package.json` but must also be in the lockfile. Run `npm install` in `api/`, commit the result. CI and container startup fail without it.
- [ ] **Run linter** across changed `ui` and `api` files.
- [ ] **Install dependencies** across `ui`, `api`, and `workers` to verify nothing is missing.
- [ ] **Smoke test on dev** — run the full `UPLOADING → UPLOADED → VERIFYING → VERIFIED → COMPLETE` flow end-to-end, including a multi-file upload.
- [ ] **Review any remaining unaddressed Copilot PR comments** before merge.
- [ ] **Investigate OAuth token-scope validation at upload boundary** — the old architecture validated a scoped OAuth token in `secure_download` before accepting bytes onto the filesystem. That check was removed because uploads now go directly through the core API (not `secure_download`). Assess whether the current `onUploadCreate` auth check (standard Bearer token + dataset ownership) is sufficient, or whether a narrower upload-scoped token should be introduced for the TUS boundary.

### Non-Blocking (should fix before merge)

- [ ] **Check for design/scratch files** — draft docs, commented-out prototype code, `TODO`/`FIXME` notes meant only for the design stage.
- [ ] **PR description** — 56 files changed across API, UI, workers, migrations, docs. Write a summary covering: TUS upload flow, async verification pipeline, schema changes (`dataset_upload_log` direct `dataset_id` link, `create_method` on `dataset`).
- [ ] **Update diagrams** — update architecture/flow diagrams in the design doc for the new TUS-based upload design (old diagrams reflect the chunk-upload + `process_dataset_upload` workflow).

### Open Questions / TODOs for Formal Doc

- [ ] Document the `VERIFYING` / `VERIFIED` / `VERIFICATION_FAILED` status transitions and the async Celery task that drives them.
- [ ] Describe the worker-side upload workflow (`manage_upload_workflows.py`).
- [ ] Describe stalled / failed / expired upload detection and retry logic.
- [ ] Document the manifest hash computation and where it is stored.
- [ ] Clarify the `dataset_upload_log` ↔ `dataset_audit` relationship after the schema restructure (this branch removed the `audit_log_id` FK).

### Completed During Session

- [x] Removed `process_dataset_upload` and `cancel_dataset_upload` task declarations from `workers/workers/tasks/declarations.py` (user applied manually)
- [x] Deleted `workers/workers/tasks/process_dataset_upload.py` and `cancel_dataset_upload.py` (user applied manually)
- [x] Removed dead `manage_pending_dataset_uploads` and `process_upload_dataset` branches from `workers/bin/entrypoint.sh`
- [x] Stripped ~15 debug `console.log` calls from `UploadDatasetStepper.vue`; removed unused `formatDuration` import
- [x] Fixed deployment doc `paths.upload` → `paths.RAW_DATA.upload` / `paths.DATA_PRODUCT.upload`
- [x] Deleted old upload code: `secure_download/src/routes/upload.js`, `ui/src/services/upload/uploadApi.js`, `ui/src/services/upload/token.js`
- [x] Cleaned `auth.js` (removed `uploadToken`, `refreshUploadToken`), `config.js` (removed `uploadApiBasePath`)
- [x] Fixed `_getUploadServiceURL` export in `ui/src/services/upload/index.js`
- [x] Fixed `api/src/routes/index.js` import path for uploads router
- [x] Fixed logger import in `api/src/routes/datasets/uploads.js`
- [x] Added `paths.RAW_DATA.upload` and `paths.DATA_PRODUCT.upload` to `workers/workers/scripts/setup_dirs.py`
- [x] Added `create_method: 'SCAN'` to `watch.py` dataset payload
- [x] Set `create_method: 'ON_DEMAND'` in `register_dataset.py`
- [x] Fixed Prisma migration `20260311000000_upload_rewrite` to handle `file_upload_log.status` enum dependency
- [x] Docker Compose volume mount for `UPLOAD_HOST_DIR` in `docker-compose-prod.yml`

---

## Key Design Decisions

- **TUS protocol** replaces old multipart chunk upload. TUS server runs inside the API service.
- **No `process_dataset_upload` Celery task** — polling script (`manage_upload_workflows.py`) handles the `UPLOADED → VERIFYING → VERIFIED → COMPLETE` transition directly.
- **`dataset_upload_log` links directly to `dataset`** via `dataset_id` (no more `audit_log_id` indirection).
- **`create_method`** moved from `dataset_audit` to `dataset` table. Values: `SCAN`, `UPLOAD`, `IMPORT`, `ON_DEMAND`.
- **`UPLOAD_HOST_DIR`** env var controls upload storage path. Mounted as `${UPLOAD_HOST_DIR}:${UPLOAD_HOST_DIR}` in docker-compose (same path inside and outside container, matches `cmg-bioloop` pattern).
- **Checksum verification** is optional (feature-flagged). BLAKE3 manifest hash computed in UI before upload, verified by worker.
- **Upload statuses** (as of migration `20260311000000_upload_rewrite`): `UPLOADING`, `UPLOAD_FAILED`, `UPLOADED`, `VERIFYING`, `VERIFIED`, `PROCESSING`, `PROCESSING_FAILED`, `COMPLETE`, `PERMANENTLY_FAILED`, `VERIFICATION_FAILED`.

---

## Files Removed (Old Implementation)

| File | Reason |
|------|--------|
| `workers/workers/tasks/process_dataset_upload.py` | Replaced by polling script |
| `workers/workers/tasks/cancel_dataset_upload.py` | No longer needed |
| `workers/workers/scripts/manage_pending_dataset_uploads.py` | Replaced by `manage_upload_workflows.py` |
| `api/src/routes/uploads.js` | Moved to `api/src/routes/datasets/uploads.js` |
| `secure_download/src/routes/upload.js` | Old chunk-receive endpoint removed |
| `ui/src/services/upload/uploadApi.js` | Old axios-based chunk upload client |
| `ui/src/services/upload/token.js` | Old OAuth scoped-token service |
| `ui/src/pages/datasetUpload/index.vue` | Old upload page |

---

## Pending Work (Post-merge)

- **Orphan Detection:** TUS uploads that complete but fail to register (no `process_id` in DB) need a detection/cleanup mechanism.

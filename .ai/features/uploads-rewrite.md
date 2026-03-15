# Uploads Feature Rewrite — Pre-PR Checklist & Decisions

**Feature:** TUS-based resumable uploads replacing old chunk-upload implementation  
**Branch:** `uploads-rewrite---pr-feedback`  
**Last Updated:** 2026-03-13

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

- [ ] **Rewrite existing upload e2e tests** — existing tests were written for the old chunk-upload implementation and need to be rewritten for the new TUS-based flow.
- [ ] **Check for design/scratch files** — draft docs, commented-out prototype code, `TODO`/`FIXME` notes meant only for the design stage.
- [ ] **PR description** — 56 files changed across API, UI, workers, migrations, docs. Write a summary covering: TUS upload flow, async verification pipeline, schema changes (`dataset_upload_log` direct `dataset_id` link, `create_method` on `dataset`).
- [ ] **Update diagrams** — update architecture/flow diagrams in the design doc for the new TUS-based upload design (old diagrams reflect the chunk-upload + `process_dataset_upload` workflow).
- [ ] **Update existing upload e2e tests** — existing specs under `tests/src/tests/view/authenticated/upload/` still navigate to the old route `/datasetUpload/new` and reference removed form fields (analysis type, genomic fields, source data product). All specs need updating to the new route `/datasets/uploads/new` and the new stepper structure.
- [ ] **Write new upload e2e scenarios** — see "New Upload E2E Scenarios" section below.

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

---

## New Upload E2E Scenarios

Scenarios to cover when writing/updating upload e2e tests. These are plain descriptions; Playwright implementation lives (or will live) in `tests/src/tests/view/authenticated/upload/`.

---

### 1. Single-file upload — happy path
Upload one regular (non-zero-byte) file. Verify:
- Upload progress reaches 100%.
- Upload log status becomes UPLOADED.
- Dataset appears in /datasets/uploads with status UPLOADED.

### 2. Multi-file upload — happy path
Upload 3+ regular files at once. Verify:
- Each file reaches 100% progress.
- Upload log status becomes UPLOADED.
- All files are present in the dataset's origin_path on disk.

### 3. Directory upload — happy path
Select a directory containing several files in nested subdirectories. Verify:
- All files upload without errors.
- Directory structure is recreated under origin_path (e.g. `origin_path/<dir_name>/subdir/file`).
- Upload log status becomes UPLOADED.

### 4. Directory upload containing zero-byte (marker) files
**This covers the bug fixed on 2026-03-15 (PostHandler expiry check / 410 Gone).**

Background: `@tus/server` v1.6 PostHandler calls `store.getUpload()` after `onUploadFinish` to add the `Upload-Expires` response header. `getUpload()` calls `fs.stat()` on the TUS staging data file. For a zero-byte file, `onUploadFinish` fires during the POST (not a PATCH), so the staging file has already been moved/renamed by the time TUS tries to stat it, causing a 410 Gone error back to the client.

How to reproduce (before fix):
1. Create a directory that includes at least one 0-byte file (e.g., a marker file like `.end-of-run`, `DONE`, or any empty file).
2. Upload that directory via the UI.
3. Observe a 410 error on `POST /api/uploads/files` in the network log for the 0-byte file.
4. The overall upload fails or that file is never retried, leaving the upload incomplete.

What to test (after fix):
- Upload a directory containing a mix of regular files AND at least one 0-byte file.
- Verify ALL files (including the 0-byte one) upload with HTTP 201 on POST — no 410/500.
- Verify the 0-byte file exists at the correct path under origin_path with size 0.
- Verify upload log status becomes UPLOADED.
- Verify the API log shows "Recreating TUS staging placeholder (PostHandler expiry compat)" for the moved files (confirming the fix ran).

Test data: create attachments like `[{ name: 'data.csv', content: 'a,b,c' }, { name: '.end-of-run', content: '' }]`.

### 5. Resume after interrupted upload
Simulate a mid-upload interruption (e.g., using the `X-Simulate-Failure` header against the TestableFileStore in non-prod, or by cutting network during upload). Re-initiate. Verify:
- The client resumes from the correct offset (no files re-sent from byte 0).
- Upload completes and status becomes UPLOADED.

### 6. Upload with duplicate dataset name
Enter a dataset name that already exists. Verify:
- Upload button is disabled.
- Error message "Dataset already exists" is visible.
- No upload is initiated.

### 7. Full pipeline — UPLOADING → UPLOADED → VERIFYING → VERIFIED → COMPLETE
After a successful upload, wait for the worker pipeline to complete. Verify:
- Status column on /datasets/uploads transitions through each state.
- /datasets/:id shows the dataset as COMPLETE.
- Spinner → success icon transition happens in the "Created via" field on the dataset page (for non-admin role).

---

## Pending Work (Post-merge)

- **Orphan Detection:** TUS uploads that complete but fail to register (no `process_id` in DB) need a detection/cleanup mechanism.

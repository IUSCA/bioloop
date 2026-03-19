# Uploads Feature Rewrite — Pre-PR Checklist & Decisions

**Feature:** TUS-based resumable uploads replacing old chunk-upload implementation  
**Branch:** `uploads-rewrite---pr-feedback`  
**Last Updated:** 2026-03-15 (pipeline gap fixes)

---

## Pre-PR Checklist

> Canonical source also lives in `docs/design/upload-rewrite.md`.

### Blocking (must fix before merge)

- [x] **Multi-file upload bug** — `/complete` endpoint only moves the last file. Must accept all `process_ids` and move every file to `origin_path`. Both API and UI changes required.
- [x] **`api/package-lock.json` not committed** — `@tus/file-store`, `@tus/server`, `ioredis` are in `package.json` but must also be in the lockfile. Run `npm install` in `api/`, commit the result. CI and container startup fail without it.
- [ ] **Run linter** across changed `ui` and `api` files.
- [ ] **Install dependencies** across `ui`, `api`, and `workers` to verify nothing is missing.
- [ ] **Remove noisy upload UI console logs** — keep only operationally useful logs in upload UI code.
- [x] **Smoke test on dev** — run the full `UPLOADING → UPLOADED → VERIFYING → VERIFIED → COMPLETE` flow end-to-end, including a multi-file upload.
- [x] **Mid-file upload test** — upload at least one file around 500 MB to verify TUS chunking, resumability, and that no proxy/server timeouts occur at scale.
- [ ] **Large-file upload test** — upload at least one file ≥ 10 GB to verify TUS chunking, resumability, and that no proxy/server timeouts occur at scale.
- [x] **Large-file-count upload test** — upload at least one directory with around 5000 files, to verify TUS chunking, resumability, and that no proxy/server timeouts occur at scale.
- [x] **Performance comparison vs Google Drive** — upload the iseq-DI dataset to Google Drive and compare upload throughput, time-to-complete, and UX against Bioloop. Document findings.
- [ ] **Strengthen no-checksum fallback verification** — when `upload_verify_checksums` is disabled, the worker currently only confirms files exist at `origin_path`. Investigate whether TUS stores per-file metadata (final offset, declared upload-length, etc.) that survives the move to `origin_path`, and if so use it to verify each file's size matches what TUS declared complete. At minimum, compare each file's `stat().st_size` against the size recorded in the upload log (sent by the UI in the `/complete` payload) without reading file content.
- [ ] **Think through test strategy for verification task and upload management script** — see "Test Strategy" section at the bottom of this document for a list of ideas. Decide which are worth implementing now vs. post-merge.
- [ ] **Review any remaining unaddressed Copilot PR comments** before merge.
- [ ] **Investigate OAuth token-scope validation at upload boundary** — the old architecture validated a scoped OAuth token in `secure_download` before accepting bytes onto the filesystem. That check was removed because uploads now go directly through the core API (not `secure_download`). Assess whether the current `onUploadCreate` auth check (standard Bearer token + dataset ownership) is sufficient, or whether a narrower upload-scoped token should be introduced for the TUS boundary.

### Non-Blocking (should fix before merge)

- [ ] **Rewrite existing upload e2e tests** — existing tests were written for the old chunk-upload implementation and need to be rewritten for the new TUS-based flow.
- [ ] **Failure-mode / adversarial testing** — systematically exercise every place the upload pipeline can break. Categories and specific cases to cover:
  - **Client-side / pre-upload:**
    - Special characters in filenames: spaces, unicode, emoji, `&`, `#`, `+`, null bytes
    - Very long filenames or deeply nested directory paths (OS path-length limits)
    - Symbolic links inside a directory upload (browser may expose or silently skip)
    - File modified between hash computation and upload start (client hash vs. uploaded bytes mismatch)
    - BLAKE3 WASM fails to load (hash-wasm import error) — verify graceful fallback or clear error in UI
    - Very large number of files in one directory upload (hundreds / thousands)
  - **Directory structure edge cases:**
    - Root-level files mixed with nested subdirectory files
    - Directory containing only zero-byte files (all marker files, no data)
    - Deeply nested directories (e.g. 10+ levels)
    - Hidden files (`.DS_Store`, `.gitkeep`, `.env`) — verify they are included/excluded consistently on both sides
    - Duplicate filenames in different subdirectories (e.g. `a/data.csv` and `b/data.csv`)
    - Directory whose name matches a dataset that already exists (name-collision handling)
  - **Network / mid-upload failures:**
    - Network cut during upload → TUS resume resumes from correct offset, no files re-sent from byte 0
    - Browser tab closed mid-upload → re-opening UI and re-initiating resumes (or starts fresh cleanly)
    - API process restart mid-upload → TUS state files survive; client reconnects and resumes
    - Simulated PATCH failure via `X-Simulate-Failure` header at various offsets
  - **API / server-side failures:**
    - Disk full on TUS staging volume during upload
    - `origin_path` does not exist when `onUploadFinish` fires (directory creation fails)
    - `onUploadCreate` called for a dataset already in `COMPLETE` or `VERIFIED` status — verify rejection
    - Expired / revoked Bearer token during a long upload (mid-stream 401 handling)
    - TUS metadata missing required fields (`dataset_id`, `filename`) — verify 400, no partial state left
    - Two concurrent uploads to the same dataset_id — verify no interleaving corruption
  - **Worker / verification failures:**
    - Worker process killed (SIGKILL) mid-hash — verify Celery retry picks up cleanly
    - Origin path deleted or files moved after upload but before verification starts — verify `VERIFICATION_FAILED` and meaningful log
    - Actual hash mismatch (manually corrupt one byte of an uploaded file on disk) — verify `VERIFICATION_FAILED` status, error logged, no silent pass-through
    - Celery retry exhaustion (all 4 attempts fail) — verify status lands on `PERMANENTLY_FAILED`, not stuck in `VERIFYING`
    - Verification of a very large file / directory near the 24-hour `time_limit` — verify `SoftTimeLimitExceeded` is handled gracefully
    - `worker_process_id` missing from `upload_log.metadata` when worker logs page is visited (UI graceful "no logs yet" state)
  - **State machine / pipeline edge cases:**
    - Upload stuck in `UPLOADING` indefinitely (stale upload) — verify `manage_upload_workflows.py` detects and transitions it
    - Upload stuck in `VERIFYING` (worker died before writing result) — verify stale-verification detection
    - Re-uploading a dataset that previously reached `VERIFICATION_FAILED` — verify fresh attempt starts cleanly
    - `/datasets/uploads/:id` page visited before `worker_process_id` is written — verify no JS crash, "logs pending" message shown
- [ ] **Check for design/scratch files** — draft docs, commented-out prototype code, `TODO`/`FIXME` notes meant only for the design stage.
- [ ] **PR description** — 56 files changed across API, UI, workers, migrations, docs. Write a summary covering: TUS upload flow, async verification pipeline, schema changes (`dataset_upload_log` direct `dataset_id` link, `create_method` on `dataset`).
- [ ] **Update diagrams** — update architecture/flow diagrams in the design doc for the new TUS-based upload design (old diagrams reflect the chunk-upload + `process_dataset_upload` workflow).
- [x] **Update existing upload e2e routes** — specs under `tests/src/tests/view/authenticated/upload/` now use `/datasets/uploads/new`.
- [ ] **Write new upload e2e scenarios** — see "New Upload E2E Scenarios" section below.

### Pipeline Robustness Fixes (applied 2026-03-15) — Test Before Merge

Five transactional / ordering gaps in the upload pipeline were identified and patched.
Each fix needs manual verification because they cover failure paths that can't be hit by the normal happy-path smoke test.

---

#### Gap B — VERIFIED → COMPLETE "permanently stuck" (HIGH)
**What was fixed:** `handle_verified_status` used to write the Postgres `workflow` row *before* calling `int_wf.start()`. If `start()` or the subsequent COMPLETE status write failed, the row-existence guard silently skipped all future retries, leaving the upload stuck at VERIFIED forever. Fix: `start()` is now called first; if the row already exists on a retry, only the COMPLETE write is retried (no second Celery chain).

**How to test (post-fix):**
1. Temporarily monkey-patch `api.update_dataset_upload_log` in `manage_upload_workflows.py` to raise an exception on the COMPLETE write (e.g. add `raise Exception("injected")` immediately after `int_wf.start()`).
2. Upload a dataset and let it reach VERIFIED.
3. Run the cron script once — it should call `start()`, write the workflow row, then hit the injected exception. COMPLETE is NOT written.
4. Remove the injection and run the cron again — it should detect the existing workflow row, skip `start()`, and write COMPLETE cleanly. Upload reaches COMPLETE; only one workflow exists in the DB.

---

#### Gap C2 — PROCESSING_FAILED retry strands in PROCESSING (HIGH)
**What was fixed:** The retry path wrote `status=PROCESSING` first. If any subsequent step (workflow create, `start()`, or workflow-row write) failed, the upload was stranded in `PROCESSING` — invisible to both pollers (`get_stalled_uploads` looks for UPLOADED/VERIFYING/VERIFIED; `get_failed_uploads` looks for PROCESSING_FAILED). Also: a successful retry never wrote COMPLETE, leaving the upload stuck at PROCESSING even after the workflow ran. Fix: removed the PROCESSING write entirely; COMPLETE + updated retry_count are written atomically at the end.

**How to test:**
1. Force an upload to PROCESSING_FAILED status via SQL: `UPDATE dataset_upload_log SET status='PROCESSING_FAILED', retry_count=0 WHERE dataset_id=<id>;`
2. Run `manage_upload_workflows.py` — verify it retries (creates workflow, starts Celery chain), writes COMPLETE, and updates retry_count.
3. Repeat the SQL injection and run again with an injected failure on `int_wf.start()` — verify the upload stays at PROCESSING_FAILED (no stranded PROCESSING write) and is visible to the next retry cycle.

---

#### Gap C4 — Celery task FAILURE doesn't update DB status (MEDIUM)
**What was fixed:** When Celery marks a verification task as FAILURE (e.g. worker crash), `handle_verifying_status` only logged it and returned. The verification subprocess is supposed to write VERIFICATION_FAILED itself, but if the API was unreachable at that moment, the status stayed VERIFYING until the 24-hour timeout. Fix: `handle_verifying_status` now re-fetches the upload log when `task_state == FAILURE`; if the status is still VERIFYING, it writes VERIFICATION_FAILED as a fallback.

**How to test:**
1. Start a verification task and kill the Celery worker mid-run (SIGKILL the process).
2. Wait for Celery to mark the task as FAILURE (may require worker restart).
3. Run `manage_upload_workflows.py` — verify the upload transitions to VERIFICATION_FAILED in the DB without waiting 24 hours.
4. Alternatively: in `verify_upload_integrity.py` add `sys.exit(1)` before the `api.update_dataset_upload_log(VERIFICATION_FAILED)` call to simulate API unreachability, then confirm the fallback write in step 3.

---

#### Gap C1 — VERIFYING status + task_id were two separate API writes (LOW)
**What was fixed:** `handle_uploaded_status` first wrote `status=VERIFYING`, then enqueued the Celery task, then wrote `task_id` to metadata. A crash between enqueue and the second write left the upload with VERIFYING status but no task_id, or with a task_id in DB from a task that was never enqueued. Fix: task_id is now pre-generated with `uuid.uuid4()`; both status and task_id are written in a single API call before `apply_async` is called.

**How to test:**
1. Inject a failure after the single combined write but before `apply_async` (simulate RabbitMQ being down).
2. Verify the upload has `status=VERIFYING` AND `metadata.verification_task_id` set in the DB.
3. Run `handle_verifying_status` — it should see `task_state=PENDING` (Celery has no record of this task_id). It will wait up to 24 h then time out to VERIFICATION_FAILED. Confirm the 24-hour timeout path reaches VERIFICATION_FAILED.
4. (Normal path) Upload and let it reach UPLOADED, run the cron once — confirm a single DB write sets both status and task_id atomically (check API logs for one `[UPLOAD-LOG-UPDATE]` entry covering both fields).

---

#### Gap C5 — Metadata merge TOCTOU in `PATCH /:id/upload-log` (LOW)
**What was fixed:** The endpoint did `findFirst → merge in JS → update`. Two concurrent callers (PM2 cron writing `verification_task_id`, Celery task writing `worker_process_id`) could race and the second write would silently overwrite the first's keys. Fix: metadata is now merged via a single atomic `UPDATE ... SET metadata = COALESCE(metadata,'{}') || $new::jsonb` Postgres statement, serialised at the row-lock level.

**How to test:**
1. Craft two concurrent `PATCH /datasets/:id/upload-log` requests — one with `metadata: {key_a: 1}` and one with `metadata: {key_b: 2}`. Fire them simultaneously (e.g. via a small script with `Promise.all`).
2. After both complete, fetch the upload log and verify `metadata` contains BOTH `key_a` and `key_b`. Before the fix one of the keys would be missing roughly 50% of the time.

---

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
- [x] Synced `.ai/features/uploads-rewrite.md` against `bioloop` and `bioloop-5` copies (no divergent decisions found)

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

---

## Design Discussions (Decide Before or Shortly After Merge)

### Dataset Name Uniqueness / Re-upload Redesign

**Addresses failure analysis items C1, C2, L2.**

**Problem:** `@@unique([name, type, is_deleted])` means any dataset whose upload failed or got stuck in UPLOADING permanently reserves the name. Users cannot re-upload under the same name without admin intervention. Two concurrent uploads with the same name produce a generic 500 instead of "name already taken."

---

#### Recommended Implementation: Tombstone-on-failure (zero schema changes)

**Key insight:** `origin_path` already embeds the dataset `id` (`/uploads/{type}/{id}/{name}`), so it is always unique regardless of `name`. The `name` field's uniqueness constraint is the only blocker for re-upload.

**How it works — on any terminal upload failure (UPLOAD_FAILED, VERIFICATION_FAILED, PERMANENTLY_FAILED):**
1. Rename `dataset.name` → `{name}--{id}` (using the dataset's own DB id, always unique).
2. Set `dataset.is_deleted = true`.

This frees the `(name, type, is_deleted=false)` slot, allowing a new upload to use the same display name. The user can re-upload immediately without admin intervention.

**Why this is safe:**
- `origin_path` is stored in the DB and never re-derived from `name`, so renaming doesn't affect the filesystem or any code that reads `origin_path`.
- `is_deleted = true` hides the tombstone dataset from all normal listings (they filter `is_deleted: false`). Admin upload history queries `dataset_upload_log` directly — it will show the tombstone name (`my-dataset--42`) for failed entries, which is acceptable in an admin-only view.
- Workers read `dataset.name` only for logging — they won't be confused by a tombstone name since it only appears for failed uploads.
- The `/:name/exists` endpoint already filters `is_deleted: false` by default — no change needed. ✓

**Changes required (minimal — no schema migration, no new columns):**
- `markUploadAsFailed()` in `api/src/routes/datasets/uploads.js`: after updating the log, also `update dataset set name = name || '--' || id, is_deleted = true`.
- `PATCH /datasets/:id/upload-log` in the same file: when the incoming status is `VERIFICATION_FAILED` or `PERMANENTLY_FAILED`, add the same tombstone step on the dataset.
- `POST /datasets/uploads`: catch Prisma P2002 (unique constraint violation) and return 409 "A dataset with that name already exists" instead of 500 — handles the L2 race condition.
- Stale-UPLOADING cron (C1 fix, pending): when transitioning UPLOADING → UPLOAD_FAILED, same tombstone step.

**What does NOT change:**
- `dataset.name` usage in UI, workers, import pipelines — unchanged.
- Existence check endpoint — unchanged.
- Schema — no new columns, no migration.
- `origin_path` — unchanged.

---

#### Alternative (if display-name vs. slug separation is wanted in future)

The industry-standard approach (WordPress slugs, GitHub repos, PyPI) would add:
1. **Display name** — user-entered, no uniqueness constraint.
2. **Slug / canonical name** — derived from display name, unique, used as the machine identifier.

This is the "proper" long-term architecture but requires a schema migration, updating `origin_path` construction, and updating every place the dataset name is displayed. It is a separate project, not scoped to this branch.

---

## Test Strategy (TODO: Flesh Out)

### Upload Verification Task (`verify_upload_integrity.py` + `upload.py`)

Ideas for unit/integration tests:
- Mock `origin_path` with a known set of files; compute expected BLAKE3 manifest hash independently and assert equality.
- Test hash mismatch path: write a single corrupted byte to one file after computing the expected hash; assert exception is raised with the expected/computed values in the message.
- Test `blake3` not installed: mock `import blake3` to raise `ImportError`; assert the explicit error message is raised (not a silent fallback).
- Test client skip-marker path: pass `metadata.checksum = { skipped: True, skipped_reason: 'client_computation_failed' }` in the upload log; assert `_verify_files_exist` is called and no exception is raised for a healthy directory.
- Test legacy/feature-disabled path: pass `upload_log = None`; assert existence check runs.
- Test empty `origin_path`: assert exception with "No files found".
- Test missing `origin_path`: assert exception with "Origin path does not exist".
- Test 0-byte files: include a 0-byte file in the test dataset; verify it is included in the manifest and hashed correctly.

### Upload Management Script (`manage_upload_workflows.py`)

Ideas:
- Unit-test each `handle_*_status` function in isolation by mocking the API client and Celery.
- `handle_uploaded_status`: mock `apply_async` to return a fake task; assert the correct single combined API write (status=VERIFYING + task_id) is made before `apply_async` is called.
- `handle_verifying_status` — FAILURE fallback: mock Celery task state as FAILURE and DB status as VERIFYING; assert VERIFICATION_FAILED write is made.
- `handle_verifying_status` — 24-hour timeout: set `updated_at` to 25 hours ago; assert timeout transition fires.
- `handle_verified_status` — atomic write: mock `int_wf.start()` to succeed; assert the COMPLETE + `workflow_id` write is a single API call.
- `handle_verified_status` — existing workflow guard: pre-populate a workflow row; assert `start()` is NOT called again and only the COMPLETE write is retried.
- `process_stalled_uploads` / `process_failed_uploads`: mock the stalled/failed upload list; assert correct handler is dispatched for each status.
- End-to-end integration test (heavier): spin up a test DB and a mock Celery backend; run the script against seeded upload log rows and assert final statuses.

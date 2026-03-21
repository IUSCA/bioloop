# Upload Feature — Failure Mode Analysis

**Branch:** `uploads-rewrite---pr-feedback`  
**Analyzed:** 2026-03-15  
**Purpose:** Comprehensive review of failure cases across the full upload pipeline, for agent/reviewer action.

---

## Pipeline Overview

```
[Client: file selection]
  → [Client: BLAKE3 checksum computation]
  → [API: POST /datasets/uploads — create dataset + log in UPLOADING]
  → [TUS: onUploadCreate — auth gate]
  → [TUS: PATCH bytes — tus-js-client sends, @tus/server receives]
  → [API: onUploadFinish — moves staged file to origin_path]
  → [Client: POST /datasets/:id/complete — status → UPLOADED]
  → [Cron: manage_upload_workflows.py — UPLOADED → VERIFYING]
  → [Celery: verify_upload task → subprocess verify_upload_integrity.py]
  → [Subprocess: BLAKE3 re-hash → VERIFIED]
  → [Cron: VERIFIED → triggers integrated workflow → COMPLETE]
```

---

## Stage 1: Client Pre-Upload

### 1.1 — `onMounted` resource loads fail (instruments / raw-data / projects)
- **Recoverability:** Caught. `toast.error("An error occurred. Please refresh the page to try again.")` is shown. The page still renders.
- **User feedback:** ✅ Toast shown. However, the checkboxes ("Assign Raw Data", "Assign Project") will be in an incorrect disabled state because `noRawDataToAssign` etc. default to `false` and never get set. The user can still proceed to upload — they just lose assignment ability silently.

### 1.2 — Dataset-name existence API call fails (`validateIfExists` network error)
- **Recoverability:** Caught via `.catch(() => reject())`. Returns `{ isNameValid: false, error: UNKNOWN_VALIDATION_ERROR }`.
- **User feedback:** ✅ "An unknown error occurred" shown under the name field. Next button is blocked. User must re-type the name to re-trigger validation.

### 1.3 — BLAKE3 WASM fails to load (`hash-wasm` import error)
- **Recoverability:** `_loadBlake3` throws. `computeManifestHash` catches and returns `null`. Upload proceeds with `computedChecksum.value = null`. Worker falls back to file-existence-only verification.
- **User feedback:** ❌ **Silent failure.** Checksum progress disappears and the upload starts as normal. The UI has a `CHECKSUM_COMPUTATION_FAILED` status defined in `UploadStatusIcon.vue` but it is never set in this path — the error is swallowed in the `catch` block of `computeManifestHash` with the comment "Don't fail upload if checksum computation fails". Integrity verification is silently degraded with no user indication.

---

## Stage 2: Pre-Upload API Registration (`POST /datasets/uploads`)

### 2.1 — API call fails entirely (network, 500, etc.)
- **Recoverability:** `preUpload()` throws `new Error("Error logging dataset upload")`. Propagates to `onSubmit`'s `.catch`, which sets `submissionStatus = PROCESSING_FAILED` and `submissionAlert = "There was an error. Please try submitting again."`. Then `handleSubmit`'s `.catch` fires and **overwrites** the specific message with the generic `"An error occurred."` (see Cross-Cutting Issue H1).
- **User feedback:** ⚠️ Generic "An error occurred." No "Retry" button (`uploadRegistrationFailed` is only set in `handleUploadComplete`).
- **Re-attempt path:** ✅ The Upload button is re-enabled (since `PROCESSING_FAILED` is not in the disable-list and `submissionSuccess = false`). Clicking Upload again re-runs `preUpload` from scratch, creating a fresh dataset log (since `datasetUploadLog.value` is null).

### 2.2 — Dataset name collision at DB level (race condition between two users)
- Both users pass the client-side `check_if_exists` check simultaneously, then the second DB insert throws a Prisma unique constraint error, surfaced as a 500.
- **User feedback:** ⚠️ Generic "An error occurred." — no "Dataset name already taken" message.

---

## Stage 3: TUS Authorization Gate (`onUploadCreate`)

### 3.1 — `dataset_id` missing or invalid in TUS metadata
- TUS throws 400. tus-js-client treats this as a non-retryable error. `onError` fires. `uploadFilesWithTus` returns `false`. `onSubmit` sets `UPLOAD_FAILED` and a specific message — then **`handleSubmit.catch` overwrites it with "An error occurred."** (see H1).
- **User feedback:** ❌ Generic "An error occurred." No Retry button. No actionable info.
- **DB state:** Stays in UPLOADING. Never cleaned up by cron (see Critical Issue C1).

### 3.2 — Upload log not in UPLOADING state (409 conflict)
- Throws `tusError(409, ...)`. Same non-retryable error path. Generic message, no Retry button. The 409 guard is correct behavior (prevents double-upload), but the user gets no explanation of why it failed.
- **User feedback:** ❌ "An error occurred." No indication that the dataset is already in a terminal state.

### 3.3 — Auth failure (403 — user attempts to upload to a dataset they do not own)
- Same non-retryable error path. Generic message shown.
- **User feedback:** ❌ "An error occurred." No indication of authorization failure.

---

## Stage 4: TUS Byte Transfer (PATCH requests)

### 4.1 — Network interruption during upload
- tus-js-client retries with Fibonacci back-off (`[0, 1s, 2s, 3s, 5s, 8s, 13s, 21s, 34s, 55s, 89s, 144s, 233s, 377s]` ≈ 16 minutes total). Within this window, TUS resumes from the correct byte offset. Beyond this window, `onError` fires.
- **Recoverability:** ✅ Within the 16-minute window. After that, the specific "Some files could not be uploaded." message is set then immediately overwritten by `handleSubmit.catch` (see H1).
- **Re-attempt:** User can click Upload again. Since `datasetUploadLog.value` is set (pre-upload succeeded), `preUpload` calls `updateDatasetUploadLog({ status: UPLOADING })` — resetting DB status. New TUS sessions start from byte 0 (no client-side URL fingerprinting across sessions).

### 4.2 — Token expiry during a long upload (401 mid-stream)
- HTTP 401 is not treated as a network error by tus-js-client; it does not retry. `onError` fires.
- **User feedback:** ❌ "An error occurred." No indication about token expiry. User must refresh/re-login and retry.
- **DB state:** Stuck in UPLOADING (see C1).

### 4.3 — Multi-file upload — some files succeed, some fail
- `Promise.all(uploadPromises)` runs all uploads concurrently. If one `onError` fires, `Promise.all` ultimately rejects. Files that completed already had `onUploadFinish` fire and were **already moved to `origin_path`**.
- **Recoverability:** Partial. `moveTusFileToDestination` is idempotent (skips if `finalPath` exists). A retry re-uploads all files; already-moved ones are no-ops.
- **User feedback:** ❌ Generic "An error occurred." No per-file status. No indication of which files succeeded vs. failed. Progress bar shows partial completion but conveys no per-file information.

---

## Stage 5: `onUploadFinish` (Server-Side File Move)

### 5.1 — Filesystem error during `fs.renameSync` or `fs.mkdirSync`
- `moveTusFileToDestination` throws. `onUploadFinish` re-throws via `tusError(...)`. TUS sends an error response to the client for the final PATCH. After all tus-js-client retries, `onError` fires.
- **DB state:** ❌ **Stays in UPLOADING indefinitely.** The file never reached `origin_path`. Critically, `manage_upload_workflows.py` does **not** process `UPLOADING` status — only `UPLOADED`, `VERIFYING`, `VERIFIED`, and `PROCESSING_FAILED`. The `/expired` endpoint detects stale UPLOADING records, but the cron never calls it. **This upload is stuck forever unless manually resolved.**
- **User feedback:** ❌ "An error occurred." No indication that files couldn't be moved. No retry guidance.

### 5.2 — TUS `.json` sidecar file missing
- `readTusFileInfo` logs a warning and falls back to `originalFilename = 'uploaded_file'`.
- **In a multi-file upload**, all files with missing sidecars target the same `origin_path/uploaded_file` destination. The first move succeeds; subsequent ones see `finalPath` already exists and are silently skipped. **All but the first file with a missing sidecar are silently dropped.**
- **User feedback:** ❌ Silent data loss. Upload log shows success (UPLOADED), but files are missing from `origin_path`.

### 5.3 — Zero-byte file (`onUploadFinish` fires during POST, not PATCH)
- ✅ **Fixed** (2026-03-15 patch). The staging placeholder is recreated so TUS `getUpload()` stat call succeeds. Working correctly.

### 5.4 — `uploadLog` or `dataset` not found in DB during `onUploadFinish` (404)
- Throws `tusError(404, ...)`. Files that already completed have already been moved. Remaining concurrent uploads in the batch receive a 404 error.
- **User feedback:** ❌ Generic "An error occurred."

---

## Stage 6: `/complete` Endpoint

### 6.1 — DB error during `prisma.dataset_upload_log.update`
- Caught. `markUploadAsFailed` sets `UPLOAD_FAILED` in DB. Returns 500.
- `handleUploadComplete` catches this (independently of `handleSubmit.catch`, since it runs fire-and-forget):
  - `uploadRegistrationFailed.value = true`
  - Alert: `"Files uploaded but registration failed. Please retry."`
- **Recoverability:** ✅ Retry button shown. `retryApiCall` re-calls `handleUploadComplete` → `/complete`. `/complete` finds `UPLOAD_FAILED` (not the UPLOADED idempotent check), proceeds to update to UPLOADED. Works correctly.
- **User feedback:** ✅ Specific actionable message with visible Retry button.

### 6.2 — `/complete` called when status is neither UPLOADING nor UPLOADED
- The idempotent guard only short-circuits on `UPLOADED`. If status is already `VERIFYING` or `VERIFIED` (very unlikely but possible if the cron is unusually fast), `/complete` would **regress the status back to UPLOADED**, causing re-verification. The guard is incomplete.

---

## Stage 7: UPLOADED → VERIFYING (Cron)

### 7.1 — API unreachable when cron runs
- Caught at the top level of `process_stalled_uploads`. Upload stays in UPLOADED. Re-attempted on next cron run (1 minute later).
- **User feedback:** ⚠️ Spinner with "Processing pending" popover. No indication of cron failure. Can appear stuck for extended periods without the user knowing why.

### 7.2 — RabbitMQ/Celery broker unreachable during `apply_async`
- Caught in `handle_uploaded_status`. Upload stays in UPLOADED. Re-attempted next cron run.
- **Recoverability:** ✅ Self-healing.

### 7.3 — `apply_async` succeeds but Celery worker never picks up the task (message lost)
- Gap C1 fix (pre-generated task ID, single combined write) prevents the write-gap issue. However, if the message is lost after the write (broker drops it before any worker consumes it), the Celery task state will be `PENDING` indefinitely.
- `handle_verifying_status` sees `task_state = PENDING` and waits. The 24-hour timeout handler eventually transitions to `VERIFICATION_FAILED`.
- **User feedback:** ❌ 24-hour limbo. UI shows an infinite "Verifying upload" spinner with no signal that the system is broken.

---

## Stage 8: Verification Celery Task

### 8.1 — Worker SIGKILL mid-hash (Gap C4, fixed)
- ✅ When the worker reconnects, Celery marks the task FAILURE. Next cron run detects FAILURE state, re-fetches DB status, and if still VERIFYING applies fallback `VERIFICATION_FAILED` write.

### 8.2 — `blake3` Python package not installed on worker
- `import blake3` raises `ImportError`. Celery retries 3 times (60s delay). On the 4th attempt (`is_final_retry = True`), sets `VERIFICATION_FAILED` in DB and sends admin notification.
- **Recoverability:** ✅ Eventually fails cleanly to VERIFICATION_FAILED. But all future uploads also fail verification until the package is installed.

### 8.3 — Hash mismatch (corrupted file, or file modified between hash computation and upload)
- `verify_upload_integrity` raises an exception. Subprocess exits 1. `SubprocessError` raised in `verify_upload.py`. Celery `autoretry_for=(Exception,)` retries **3 additional times** (60s each). All will fail identically — a mismatch is deterministic.
- After 4 total attempts, `is_final_retry = True` → `VERIFICATION_FAILED` written.
- **Waste:** 3 redundant full re-hash attempts for a deterministic failure. For large datasets, each retry can take hours.
- **User feedback:** ❌ The detailed failure reason (expected hash vs. computed hash) is stored in `upload_log.metadata.failure_reason` but **no UI component surfaces this field**. User sees only "Upload verification failed" in the badge popover with no actionable detail.

### 8.4 — `SoftTimeLimitExceeded` (12-hour soft timeout)
- Celery's `soft_time_limit=43200` raises `SoftTimeLimitExceeded` (a subclass of `Exception`). Retried up to 3 times. After exhausting retries → `VERIFICATION_FAILED` via final-retry path or Gap C4 fallback.
- **Recoverability:** ✅ Handled by existing retry path. Terminal state correctly reached.

### 8.5 — `worker_process_id` write fails in `finally` block of `verify_upload.py`
- `api.update_dataset_upload_log` fails. Exception is caught, a warning is logged, and execution continues. The verification result (VERIFIED or VERIFICATION_FAILED) is still correctly written by the subprocess.
- **User feedback:** ⚠️ The UI's "Verification Task Logs" card at `/datasets/uploads/:id` will show no logs (empty / "no logs yet" state) since `worker_process_id` is absent from metadata. The verification outcome is correct, but the user cannot inspect what happened.

### 8.6 — Origin path deleted between upload completion and verification start
- `_verify_files_exist` or `open(file_path, 'rb')` raises an exception. Same Celery retry cycle. After 4 attempts → `VERIFICATION_FAILED`. Failure reason in metadata (not surfaced to user — see 8.3).
- **Recoverability:** ❌ No automated recovery. Admin must restore files or delete the dataset record.

---

## Stage 9: VERIFIED → COMPLETE (Cron)

### 9.1 — `int_wf.start()` fails (Celery/MongoDB unreachable) — Gap B fixed
- ✅ `start()` is called before any DB write. If `start()` fails, no workflow row is written and no status change occurs. Next cron run retries cleanly from VERIFIED.

### 9.2 — `start()` succeeds but atomic API update fails — Gap B fixed
- ✅ `workflow_id` is passed to `update_dataset_upload_log` so the workflow row and `COMPLETE` status are written in a single DB transaction. If the write fails, upload stays VERIFIED. On the next cron run, the `active_integrated_wfs` guard detects the existing workflow row, skips `start()`, and retries only the COMPLETE status write.

### 9.3 — Integrated workflow fails → PROCESSING_FAILED — Gap C2 fixed
- ✅ `process_failed_uploads` detects `PROCESSING_FAILED`, retries up to `MAX_RETRY_COUNT=3`. After exhausting retries → `PERMANENTLY_FAILED` + admin notification (if `notifications` feature flag is enabled).

---

## Cross-Cutting Issues

### C1 — 🔴 CRITICAL: `UPLOADING` status is a permanent stuck state

`manage_upload_workflows.py` only processes `UPLOADED`, `VERIFYING`, `VERIFIED`, and `PROCESSING_FAILED`. It **never calls** `GET /datasets/uploads/expired` (which detects stale `UPLOADING` records older than a configurable age). Scenarios that leave status stuck in `UPLOADING`:

1. User closes the browser tab after TUS bytes are fully sent but before `/complete` is called.
2. `onUploadFinish` fails with a filesystem error — TUS reports an error to the client, client gives up, DB is never advanced.
3. Token expiry kills the upload mid-stream; the client gives up.
4. TUS `onUploadCreate` returns a non-retryable error (400/403/409).

**Result:** The dataset record and upload log stay in `UPLOADING` indefinitely. The cron never touches them. TUS staging files expire after 7 days, but the DB records persist forever. The dataset's name is **permanently reserved**, blocking any re-upload with the same name. No automated or user-facing resolution exists.

**Fix direction:** The cron should call `GET /datasets/uploads/expired?status=UPLOADING&age_days=1` and transition those records to `UPLOAD_FAILED`, freeing the name and surfacing a proper failure status.

---

### C2 — 🔴 CRITICAL: No re-upload path after any terminal failure

Once a dataset reaches `VERIFICATION_FAILED`, `PERMANENTLY_FAILED`, or stuck `UPLOADING`, the dataset record exists in the DB under that name. The UI's name-uniqueness check (both client-side `check_if_exists` and the DB unique constraint) blocks creating a new dataset with the same name. There is no "delete and retry" button in the upload UI, no documented admin procedure, and no automated cleanup. Users who experience verification failures are permanently blocked from re-uploading under the same name without admin intervention.

---

### H1 — 🟠 HIGH: `handleSubmit.catch` overwrites all specific error messages

Every failure path that calls `reject()` inside `onSubmit` results in the same generic "An error occurred." alert shown to the user:

```javascript
// UploadDatasetStepper.vue
.catch(() => {
  submissionSuccess.value = false;
  submissionAlert.value = "An error occurred."; // always overwrites the specific message
  submissionAlertColor.value = "warning";
  isSubmissionAlertVisible.value = true;
})
```

The more informative messages set earlier — `"Some files could not be uploaded."` (TUS failure) and `"There was an error. Please try submitting again."` (pre-upload API failure) — are always overwritten. The only specific error path that survives is the `/complete` failure in `handleUploadComplete`, because that runs fire-and-forget and manages its own error state independently.

---

### H2 — 🟠 HIGH: `metadata.failure_reason` never surfaced to users

When verification fails, a detailed reason (hash mismatch with expected/computed values, exception text, timeout message) is stored in `upload_log.metadata.failure_reason`. No UI component reads or displays this field. The upload history page shows only an icon + "Upload verification failed" in the popover — the user cannot determine whether they need to re-upload, contact an admin, or wait.

---

### H3 — 🟠 HIGH: Silent BLAKE3 WASM failure (see also 1.3)

If `hash-wasm` fails to load, the checksum is silently skipped and the upload proceeds without integrity protection. The `UploadStatusIcon` component has a `CHECKSUM_COMPUTATION_FAILED` state defined and fully rendered, but it is **never set** — the error is caught and discarded in `computeManifestHash`. An upload that should have end-to-end BLAKE3 verification silently degrades to file-existence-only checking.

---

### H4 — 🟠 HIGH: 24-hour limbo for lost Celery messages (see also 7.3)

If `apply_async` places a message on the broker but the message is dropped before any worker consumes it, the Celery task state is `PENDING` indefinitely. The upload sits in `VERIFYING` for the full 24-hour timeout before transitioning to `VERIFICATION_FAILED`. During those 24 hours, the UI shows an uninterrupted spinning indicator with no signal that the system is broken.

---

### M1 — 🟡 MEDIUM: `PERMANENTLY_FAILED` shows a grey "?" icon instead of a red error

`UploadStatusBadge.vue` has explicit cases for `UPLOAD_FAILED` and `VERIFICATION_FAILED` (both red error icons) but falls through to the generic `help_outline` in grey for `PERMANENTLY_FAILED`:

```html
<!-- UploadStatusBadge.vue — fallback catch-all -->
<div v-else-if="props.status" class="flex items-center">
  <va-popover :message="`Status: ${props.status}`">
    <va-icon name="help_outline" color="secondary" />
  </va-popover>
</div>
```

A permanently failed upload is the most severe terminal state and should have the most alarming visual treatment.

---

### M2 — 🟡 MEDIUM: No per-file failure feedback in multi-file uploads (see also 4.3)

When one file in a multi-file batch fails, `Promise.all` rejects and the user sees a single generic error. Files that completed (and were already moved to `origin_path`) are invisible to the user. There is no per-file status row or indicator of which file failed and which succeeded.

---

### M3 — 🟡 MEDIUM: Deterministic verification failures cause 3 redundant retries (see also 8.3)

A hash mismatch is a deterministic failure — re-hashing the same corrupted file will always mismatch. Despite this, the Celery task retries 3 additional times (60s apart) before reaching `is_final_retry`. For large datasets where each hash takes significant time, this delays the final `VERIFICATION_FAILED` status by hours of unnecessary work.

---

### M4 — 🟡 MEDIUM: `onUploadFinish` filesystem error leaves DB in UPLOADING, not UPLOAD_FAILED (see also 5.1)

When a file move fails in `onUploadFinish`, the TUS server returns an error to the client. After client retries are exhausted, the DB status remains `UPLOADING` — not `UPLOAD_FAILED`. A user looking at the upload history sees a spinning "Uploading" indicator indefinitely. This is distinct from Issue C1 in that the root cause is a server-side filesystem problem, but the consequence is the same stuck state.

---

### M5 — 🟡 MEDIUM: Missing TUS sidecar file causes silent file name collision and data loss (see also 5.2)

If `readTusFileInfo` cannot find the `.json` sidecar for a file (unexpected TUS state), it falls back to `originalFilename = 'uploaded_file'`. In a multi-file upload, multiple files with missing sidecars all target `origin_path/uploaded_file`. The second move is silently skipped by the idempotent guard — that file is permanently lost. The upload still transitions to `UPLOADED` and the user is never informed.

---

### L1 — 🟢 LOW: No cross-session TUS resumption on retry

tus-js-client is initialized without URL fingerprinting / `storeFingerprintForFile`. After a page reload or a new "Upload" button click, there is no client-side memory of previous upload URLs. TUS resumes within a session (Fibonacci retry window), but across sessions every file starts from byte 0. For multi-GB uploads this is a significant time cost on retry.

---

### L2 — 🟢 LOW: Race-condition name collision gives generic error (see also 2.2)

Two concurrent users can both pass the client-side `check_if_exists` uniqueness check, then race at the DB level. The losing insert throws a Prisma unique constraint error, surfaced as a generic 500 and shown as "An error occurred." instead of "A dataset with that name already exists."

---

### L3 — 🟢 LOW: `/complete` has no status guard beyond the UPLOADED idempotent check (see also 6.2)

The idempotent guard in `POST /:id/complete` only short-circuits when status is already `UPLOADED`. If status is `VERIFYING` or `VERIFIED` (possible in an extreme timing edge case), `/complete` would regress it back to `UPLOADED`, causing re-verification. A guard rejecting any status that has advanced past `UPLOADING` would be safer.

---

### L4 — 🟢 LOW: `worker_process_id` write failure hides verification logs (see also 8.5)

If the `finally` block in `verify_upload.py` fails to store `worker_process_id` (transient API error), verification logs are invisible in the UI at `/datasets/uploads/:id`. The verification outcome (VERIFIED or VERIFICATION_FAILED) is written correctly by the subprocess, but the user has no logs to inspect for diagnosis.

---

### L5 — 🟢 LOW: Orphaned TUS staging files accumulate (known pending work)

Uploads that complete TUS transfer but fail `/complete` registration leave staged files in the TUS directory with no corresponding DB `process_id`. The `/all-process-ids` endpoint exists to support cross-referencing, but no cleanup script is implemented. These files expire after 7 days via TUS's built-in sweep, but for large uploads can consume significant disk in the interim. Explicitly flagged as pending in `uploads-rewrite.md`.

---

## Summary Table

| ID | Failure | DB Status | Cron Resolves? | User Sees | Re-attempt? |
|----|---------|-----------|----------------|-----------|-------------|
| 1.3 | BLAKE3 WASM load failure | UPLOADING → proceeds | N/A | Nothing (silent) | N/A — upload continues without checksum |
| 2.1 | Pre-upload API failure | Never created | N/A | "An error occurred." | ✅ Click Upload again |
| 3.1 | TUS auth gate failure | UPLOADING (stuck) | ❌ No | "An error occurred." | ⚠️ Click Upload again; cron never cleans up |
| 4.1 | Network cut >16 min | UPLOADING (stuck) | ❌ No | "An error occurred." | ✅ Click Upload again |
| 4.2 | Token expiry mid-upload | UPLOADING (stuck) | ❌ No | "An error occurred." | ✅ Re-login and retry |
| 4.3 | Multi-file partial failure | UPLOADING (stuck) | ❌ No | "An error occurred." (no per-file detail) | ✅ Click Upload again |
| 5.1 | `onUploadFinish` fs error | UPLOADING (stuck forever) | ❌ No | "An error occurred." | ⚠️ Manual only; name reserved |
| 5.2 | TUS sidecar missing | UPLOADED (data lost) | N/A | Nothing (silent data loss) | ❌ Not possible to detect |
| 6.1 | `/complete` DB error | UPLOAD_FAILED | ❌ No | ✅ "Files uploaded but registration failed. Please retry." + Retry button | ✅ Retry button |
| 7.3 | Celery message lost | VERIFYING for 24h → VERIFICATION_FAILED | ✅ After 24h | 24h of "Verifying upload" spinner | ❌ No re-upload path |
| 8.3 | Hash mismatch | VERIFICATION_FAILED (after 4 retries) | ✅ Eventually | "Upload verification failed" (no reason shown) | ❌ No re-upload path |
| 8.1 | Worker SIGKILL mid-hash | VERIFICATION_FAILED | ✅ Via Gap C4 | "Upload verification failed" | ❌ No re-upload path |
| 8.6 | `origin_path` deleted before verification | VERIFICATION_FAILED | ✅ After 4 retries | "Upload verification failed" | ❌ Admin only |
| 9.3 | Integrated workflow fails | PROCESSING_FAILED → PERMANENTLY_FAILED | ✅ Up to 3 auto-retries | Spinner then ⚠️ grey "?" icon | ❌ Admin only |
| C1 | Tab closed mid-upload (before /complete) | UPLOADING (forever) | ❌ No | Spinning "Uploading" in history forever | ❌ Name permanently reserved |

---

## Gaps Already Fixed (Do Not Re-Open)

| Gap | Fix Applied |
|-----|-------------|
| **B** — VERIFIED → COMPLETE "permanently stuck" | `start()` called before DB write; `workflow_id` passed atomically to `update_dataset_upload_log` |
| **C1** — VERIFYING status + task_id were two separate API writes | task_id pre-generated with `uuid4()`; status + task_id written in single API call before `apply_async` |
| **C2** — PROCESSING_FAILED retry strands in PROCESSING | Removed PROCESSING write entirely; COMPLETE + retry_count written atomically at end |
| **C4** — Celery FAILURE doesn't update DB status | `handle_verifying_status` re-fetches and applies fallback VERIFICATION_FAILED write on FAILURE state |
| **C5** — Metadata merge TOCTOU in `PATCH /:id/upload-log` | Atomic `UPDATE ... SET metadata = COALESCE(metadata,'{}') \|\| $new::jsonb` Postgres statement |
| **Zero-byte file 410 Gone** | Staging placeholder recreated in `moveTusFileToDestination` after move for PostHandler compat |

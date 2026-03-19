## `workers/scripts/manage_upload_workflows.py`

Polling script that drives the post-upload lifecycle. Runs every 30 seconds via the `poll_upload_workflows.sh` background loop inside the `celery_worker` container. Supports `--dry-run` (default `True`) and `--max-retries` flags.

**What it does on each run:**

1. **Stalled uploads** — fetches every upload that is stuck in `UPLOADED`, `VERIFYING`, or `VERIFIED`:
   - `UPLOADED` → spawns a `verify_upload_integrity` Celery task, transitions status to `VERIFYING`, and persists the task ID in upload metadata.
   - `VERIFYING` → inspects the Celery task state. Recovers from all failure modes: stale status with no task ID (restarts), task succeeded but status wasn't written (advances to `VERIFIED`), task timed out after 24 h (marks `VERIFICATION_FAILED`), task in `FAILURE` state (logs, leaves to the task's own error handler).
   - `VERIFIED` → triggers the integrated processing workflow and transitions status to `COMPLETE`.

2. **Failed uploads** — fetches every `PROCESSING_FAILED` upload that has not yet exceeded `max_retries`:
   - Below threshold → restarts the integrated workflow, increments `retry_count`, transitions back to `PROCESSING`.
   - At or above threshold → marks `PERMANENTLY_FAILED` and sends an admin notification.

---

## `uploads/[id].vue` — what it shows

This page is an admin-only detail view for a single dataset upload record, identified by its dataset ID in the URL. It shows:

- **Upload Overview card** — dataset name (linked to the dataset detail page), current upload status (color-coded chip), and last-updated timestamp.
- **Upload Metadata card** — a raw key/value table of the `metadata` JSON stored on the upload record (process ID, manifest hash, etc.).
- **Verification Logs card** — live, sorted log lines produced by the background verification Celery task. Only rendered once the worker has recorded its `worker_process_id` in the upload metadata.

The page auto-refreshes every 10 seconds while the upload is in a non-terminal state (`UPLOADING`, `UPLOADED`, `VERIFYING`, `VERIFIED`, `PROCESSING`, `PROCESSING_FAILED`). Polling stops automatically — without any user action — as soon as a terminal status (`COMPLETE`, `UPLOAD_FAILED`, `VERIFICATION_FAILED`, `PERMANENTLY_FAILED`) is observed. Logs are fetched through the shared `wfService` layer rather than raw `fetch()`.

---

## `UploadDatasetStepper.vue` — changes vs `origin/main`

### Core upload mechanism replaced (TUS)
The old custom chunk-based uploader (`uploadFile`, `SparkMD5`, `blobSlice`, `jwtDecode`, `CHUNK_SIZE`, `RETRY_COUNT_THRESHOLD`) is completely removed and replaced with `tus-js-client`. The new `uploadFilesWithTus()` function runs all file uploads in parallel with a Fibonacci retry-delay schedule and a 30-second overall timeout per file.

### Manifest hash computed before upload
A pre-upload checksum step was added: `_computeManifestHash()` (from the new `@/services/upload/checksum` module) is called before TUS starts, with a progress indicator. The result is cached so retries don't recompute it. The hash is passed to the `/complete` API call as metadata.

### Two-step completion flow
After all TUS uploads succeed, `handleUploadComplete()` explicitly calls `POST /datasets/uploads/:id/complete` with the `process_id` and checksum metadata. If that API call fails (files uploaded but not registered), a **Retry button** appears (replacing the Next button) to re-attempt just the registration — without re-uploading files.

### Dataset reference updated
References to `datasetUploadLog.audit_log.dataset` were updated to `datasetUploadLog.dataset`, reflecting the schema change that removed the `audit_log_id` FK from `dataset_upload_log`.

### Step 2 UI rebuilt
The old `DatasetFileUploadTable` component is replaced with an inline file list plus two stacked progress bars (checksum computation and TUS upload progress).

### Client-side file size guard
`onFilesAdded` and `onDirectoryAdded` now reject files exceeding `config.upload.max_file_size_bytes` with an immediate error, before TUS starts.

### Navigation / cancel cleanup simplified
`onBeforeUnmount` no longer calls `datasetService.cancelDatasetUpload()` — cleanup of incomplete uploads is now left to the background worker monitoring process.

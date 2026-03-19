# Upload Rewrite Design (TUS)

## Scope

This document describes the current upload architecture after the uploads rewrite.
It replaces historical chunk-upload design notes and diagrams.

## Objectives

- Support large-file and large-directory browser uploads without restarts.
- Preserve file integrity with optional end-to-end checksum validation.
- Keep upload registration and post-upload processing idempotent.
- Make failure states explicit and recoverable.

## Architecture

### Components

- UI (`UploadDatasetStepper`) orchestrates metadata collection and TUS transfer.
- API hosts TUS server and upload routes (`/datasets/uploads/*`).
- Worker cron (`manage_upload_workflows.py`) drives status transitions.
- Celery task (`verify_upload_integrity.py`) performs async verification.
- PostgreSQL stores upload logs and dataset associations.

### Removed Components

- Dedicated chunk upload API.
- OAuth upload-scope token exchange for chunk endpoints.
- `process_dataset_upload` and `cancel_dataset_upload` worker tasks.
- `manage_pending_dataset_uploads.py`.

## Request Flow

### 1) Register Upload Session

`POST /datasets/uploads`

- Creates dataset (`create_method = UPLOAD`).
- Creates `dataset_upload_log` with status `UPLOADING`.
- Persists deterministic `origin_path`.

### 2) Transfer File Bytes (TUS)

`POST/PATCH /api/uploads/files`

- TUS metadata includes `dataset_id`, `filename`, and directory metadata.
- In non-production test mode, failure simulation can be injected with:
  - `X-Simulate-Failure`
  - `X-Simulate-Failure-Count`
- `onUploadFinish` moves each file into final `origin_path` immediately.

### 3) Mark Upload Complete

`POST /datasets/uploads/:id/complete`

- Idempotently transitions upload log to `UPLOADED`.
- Records `process_id` and optional metadata (for example checksum manifest hash).
- Rejects status regression if upload already advanced beyond upload stage.

### 4) Worker-Orchestrated Post-Upload Pipeline

`manage_upload_workflows.py` runs every minute:

- `UPLOADED` -> enqueue verification task and set `VERIFYING`.
- `VERIFYING` -> inspect Celery state; apply timeout/failure fallback logic.
- `VERIFIED` -> start integrated workflow and atomically persist `COMPLETE`.
- `PROCESSING_FAILED` -> retry integrated workflow up to retry limit.
- stale `UPLOADING` sessions -> `UPLOAD_FAILED`.

## Data Model

### `dataset`

- `create_method` moved here from `dataset_audit`.
- `origin_path` set at registration time.

### `dataset_upload_log`

- Direct FK to dataset (`dataset_id`).
- `status`, `process_id`, `retry_count`, `metadata`, `updated_at`.
- `metadata` JSONB is merged atomically in SQL to avoid concurrent key loss.

## Verification Strategy

### Checksum Path

- UI computes BLAKE3 manifest hash (feature-flag controlled).
- Worker recomputes hash from `origin_path`.
- Mismatch yields `VERIFICATION_FAILED`.

### Fallback Path

- If checksum is skipped/absent, worker validates that files exist.
- This preserves compatibility for legacy/feature-disabled uploads.

## Failure Handling

- Upload completion failure writes `UPLOAD_FAILED`.
- Terminal failures (`UPLOAD_FAILED`, `VERIFICATION_FAILED`, `PERMANENTLY_FAILED`)
  tombstone the dataset (`name -> name--id`, `is_deleted = true`) to free name.
- Verification timeout protection marks stuck `VERIFYING` sessions failed.
- `VERIFIED -> COMPLETE` flow is guarded against duplicate workflow starts.

## Testing Guidance

- E2E UI coverage should include:
  - route + stepper flow validity
  - file and directory uploads
  - simulated mid-upload failure with resume
  - zero-byte file in directory upload
- Worker coverage should include:
  - manifest hash success/mismatch
  - fallback existence verification
  - `manage_upload_workflows` status-handler edge cases

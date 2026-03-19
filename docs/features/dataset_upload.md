# Dataset Upload (TUS Rewrite)

## Overview

Uploads use TUS resumable transfer handled directly by the core API.

## Architecture

### Components

- **UI** (`UploadDatasetStepper`) orchestrates metadata collection and TUS transfer.
- **API** hosts TUS server and upload routes (`/datasets/uploads/*`).
- **Worker cron** (`manage_upload_workflows.py`) drives status transitions.
- **Celery task** (`verify_upload_integrity.py`) performs async verification.
- **PostgreSQL** stores upload logs and dataset associations.

### Objectives

- Support large-file and large-directory browser uploads without restarts.
- Preserve file integrity with optional end-to-end checksum validation.
- Keep upload registration and post-upload processing idempotent.
- Make failure states explicit and recoverable.

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
- Records `process_id` and optional metadata (e.g. checksum manifest hash, size manifest).
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

## Upload Statuses

Persisted statuses:

- `UPLOADING`
- `UPLOAD_FAILED`
- `UPLOADED`
- `VERIFYING`
- `VERIFIED`
- `PROCESSING`
- `PROCESSING_FAILED`
- `COMPLETE`
- `PERMANENTLY_FAILED`
- `VERIFICATION_FAILED`

UI-only transient statuses:

- `PROCESSING` (pre-upload registration/checksum phase label)
- `COMPUTING_CHECKSUMS`
- `CHECKSUM_COMPUTATION_FAILED`

## Integrity Verification

### Checksum Path (Primary)

- UI computes BLAKE3 manifest hash (feature-flag controlled).
- Worker recomputes hash from `origin_path`.
- Mismatch yields `VERIFICATION_FAILED`.

### Size-Manifest Fallback

- When checksum computation fails or is disabled, the UI sends a `size_manifest`
  containing per-file paths and byte sizes in the `/complete` payload.
- Worker validates every expected path exists and its byte-size matches.
- Catches missing files, extra files, truncated files, and path mismatches.

### File-Existence Fallback (Legacy)

- If neither checksum nor size manifest is available, worker confirms files
  exist at `origin_path`.

## Failure Handling

- Upload completion failure writes `UPLOAD_FAILED`.
- Terminal failures (`UPLOAD_FAILED`, `VERIFICATION_FAILED`, `PERMANENTLY_FAILED`)
  tombstone the dataset (`name -> name--id`, `is_deleted = true`) to free name.
- Verification timeout protection marks stuck `VERIFYING` sessions failed.
- `VERIFIED -> COMPLETE` flow is guarded against duplicate workflow starts.

## Deployment

### Database Migration

Run inside the app container:

```bash
npx prisma migrate deploy
```

The migration (`20260311000000_upload_rewrite`):
- Moves `create_method` from `dataset_audit` to `dataset`
- Rebuilds the `upload_status` enum (adds `VERIFYING`, `VERIFIED`,
  `VERIFICATION_FAILED`, `PERMANENTLY_FAILED`; removes unused `FAILED`)
- Restructures `dataset_upload_log`: replaces `audit_log_id` indirection
  with a direct `dataset_id` FK; adds `process_id`, `retry_count`, `metadata`

### Environment Variable — API Host

Set `UPLOAD_HOST_DIR` in the API `.env` before restarting:

```
UPLOAD_HOST_DIR=/N/scratch/scadev/bioloop/dev/uploads
```

The compose file mounts this path into the container and injects the variable.
The directory must exist on the host before `docker compose up`.

### Worker — Dependencies

```bash
cd /path/to/workers
poetry install
python -c "import blake3; print('blake3 ok')"
```

### Worker — Directory Setup

```bash
python -m workers.scripts.setup_dirs          # dry run
python -m workers.scripts.setup_dirs --create # create missing dirs
```

### PM2 — Register `manage_upload_workflows` Cron

```js
{
  name: 'manage_upload_workflows',
  script: 'python',
  args: '-m workers.scripts.manage_upload_workflows --dry-run=False',
  cron_restart: '* * * * *',
  autorestart: false,
}
```

### Post-Deploy Smoke Test

1. Log in to the UI and initiate a small test upload.
2. Confirm the upload log row appears:
   ```sql
   SELECT id, dataset_id, status, process_id, retry_count, metadata
   FROM dataset_upload_log ORDER BY id DESC LIMIT 5;
   ```
3. Status should transition:
   `UPLOADING -> UPLOADED -> VERIFYING -> VERIFIED -> COMPLETE`
4. Confirm the file lands at `origin_path`.
5. Confirm the integrated workflow starts (check `/workflows` in the UI).

## Testing

- E2E UI coverage: route + stepper flow, file and directory uploads,
  simulated mid-upload failure with resume, zero-byte file in directory upload.
- Worker coverage: manifest hash success/mismatch, size-manifest fallback,
  fallback existence verification, `manage_upload_workflows` edge cases.

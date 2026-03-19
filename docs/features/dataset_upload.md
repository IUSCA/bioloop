# Dataset Upload (TUS Rewrite)

## Overview

Uploads now use TUS resumable transfer handled directly by the core API.
The old chunk-upload architecture, dedicated upload API, and
`process_dataset_upload` workflow are removed.

## Current Flow

1. UI creates an upload record via `POST /datasets/uploads`.
2. UI uploads one or more files to `POST /api/uploads/files` (TUS endpoint).
3. API `onUploadFinish` moves each completed file to the dataset `origin_path`.
4. UI finalizes the upload via `POST /datasets/uploads/:id/complete`.
5. Worker cron (`manage_upload_workflows.py`) advances:
   `UPLOADED -> VERIFYING -> VERIFIED -> COMPLETE`.
6. Verification runs in async Celery task (`verify_upload_integrity.py`).

## Storage Model

- `dataset_upload_log` links directly to `dataset` (`dataset_id` FK).
- `process_id` stores a representative TUS upload ID for audit/correlation.
- Optional checksum metadata is persisted in `dataset_upload_log.metadata`.
- `dataset.origin_path` is deterministic:
  `/uploads/{dataset_type_lower}/{dataset_id}/{dataset_name}`.

## Integrity Verification

- Primary path: compare client BLAKE3 manifest hash against server recomputation.
- Fallback path: if checksum is skipped/absent, verify files exist at `origin_path`.
- Verification failure transitions to `VERIFICATION_FAILED`.

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

## Related Docs

- Design details: `docs/design/upload-rewrite.md`
- Deployment notes: `docs/features/upload_rewrite_deployment.md`

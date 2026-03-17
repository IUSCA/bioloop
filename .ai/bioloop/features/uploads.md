# Dataset Upload Feature

**Feature Scope:** Browser-based dataset upload with TUS resumable uploads and optional BLAKE3 checksum verification.

**Status:** Core Platform Feature (TUS-based implementation as of 2026-02)

---

## Overview

The upload feature allows users to upload datasets directly from their web browser using the TUS (resumable upload) protocol. Files are uploaded via TUS with automatic resume capability, and an async polling job triggers the integrated workflow.

---

## Architecture Components

### Services Involved

1. **UI Client** - File selection, TUS upload, optional BLAKE3 checksum computation
2. **API** - TUS server, upload metadata, dataset records, `/complete` endpoint
3. **Workers** - Polling job verifies uploads and triggers integrated workflow
4. **Rhythm API** - Orchestrates integrated workflow

### Database Tables

- `dataset` - Dataset record
- `dataset_upload_log` - Upload session metadata with fields:
  - `process_id` - TUS upload ID (formerly `tus_id`)
  - `status` - UPLOADING, UPLOADED, COMPLETE, VERIFICATION_FAILED, etc.
  - `metadata` - JSON field for checksums, failure reasons
- `dataset_audit` - Audit trail for dataset creation

---

## Upload Flow (TUS-based)

### 1. Dataset Creation
1. UI calls `POST /datasets/uploads` with dataset name, type
2. API creates `dataset`, `dataset_audit`, `dataset_upload_log` records
3. API generates `origin_path`: `/uploads/{type}/{id}/{name}`
4. Status set to `UPLOADING`

### 2. TUS Upload Phase
1. For each file, TUS client sends:
   - `POST /uploads/files` - Creates upload slot, returns upload ID
   - `PATCH /uploads/files/{id}` - Sends actual file bytes (resumable)
2. TUS metadata includes: `dataset_id`, `filename`, `relative_path`, `selection_mode`, `directory_name`
3. Files stored temporarily in TUS upload directory

### 3. Completion Phase
1. UI calls `POST /datasets/uploads/:id/complete` with:
   - `process_id` - TUS upload ID
   - `metadata` - Optional BLAKE3 checksum data
2. API moves file from TUS temp to dataset's `origin_path`
3. Status set to `UPLOADED`
4. UI shows success (or retry button on failure)

### 4. Async Processing (Polling Job)
1. `manage_upload_workflows.py` runs every 30s (via entrypoint.sh in dev, PM2 in prod)
2. Finds uploads with status `UPLOADED` and `process_id` set
3. Verifies upload integrity (checksum or file existence)
4. On success: triggers `integrated` workflow directly, sets status to `COMPLETE`
5. On failure: sets status to `VERIFICATION_FAILED`

---

## Key Files

### API
- `api/src/routes/datasets/uploads.js` - Upload endpoints including `/complete`
- `api/src/services/upload.js` - TUS server configuration
- `api/src/services/dataset.js` - `getUploadedDatasetPath()` function
- `api/src/app.js` - TUS server mounting
- `api/src/constants.js` - `UPLOAD_STATUSES` enum

### Workers
- `workers/workers/scripts/manage_upload_workflows.py` - Polling job
- `workers/workers/upload.py` - `verify_upload_integrity()` for checksum verification
- `workers/bin/entrypoint.sh` - Spawns polling job in dev

### UI
- `ui/src/components/dataset/upload/UploadDatasetStepper.vue` - Upload UI
- `ui/src/services/upload/checksum.js` - BLAKE3 manifest hash computation (uses `hash-wasm`)
- `ui/src/pages/datasets/uploads/index.vue` - Upload logs table
- `ui/src/pages/datasets/uploads/[id].vue` - Upload details page
- `ui/src/services/dataset.js` - Upload-related API calls

---

## Path Construction

### API Side (api/src/services/dataset.js)

```javascript
const getUploadedDatasetPath = ({ datasetId, datasetType }) => path.join(
  config.upload.path,        // From UPLOAD_HOST_DIR env var
  datasetType.toLowerCase(), // 'raw_data' or 'data_product'
  `${datasetId}`,
);
```

### TUS FileStore (api/src/services/upload.js)

```javascript
const uploadPath = config.get('upload.path');  // From UPLOAD_HOST_DIR env var

this.tusServer = new Server({
  path: '/api/uploads/files',
  maxSize: 100 * 1024 * 1024 * 1024,  // 100 GB max file size
  datastore: new FileStore({
    directory: uploadPath,
    expirationPeriodInMilliseconds: 7 * 24 * 60 * 60 * 1000,  // 7 days
  }),
});
```

---

## Upload Statuses

| Status | Meaning |
|--------|---------|
| `UPLOADING` | Upload in progress |
| `UPLOADED` | TUS upload complete, waiting for async processing |
| `VERIFYING` | Integrity verification in progress (async Celery task) |
| `VERIFIED` | Integrity verified, ready to trigger workflow |
| `COMPLETE` | Integrated workflow triggered successfully |
| `VERIFICATION_FAILED` | Checksum mismatch or file not found |
| `PROCESSING_FAILED` | Workflow failed |
| `PERMANENTLY_FAILED` | Max retries exceeded |

---

## Checksum Verification (Optional)

When enabled (`config.upload.verify_checksums`):

1. **UI computes BLAKE3 manifest hash** before upload:
   - Hash each file
   - Create manifest: `blake3-manifest-v1\npath\tsize\thash`
   - Hash the manifest
2. **Stored in `metadata.checksum`** via `/complete` endpoint
3. **Worker verifies** by recomputing manifest hash from files at `origin_path`

**Feature Flag:**
- API: `config.get('upload.verify_checksums')`
- Workers: `config['upload']['verify_checksums']` in `workers/config/common.py`
- UI: `config.enabledFeatures.upload_verify_checksums`

Currently **disabled by default**.

---

## Configuration

### Environment Variable

| Variable | Location | Purpose |
|----------|----------|---------|
| `UPLOAD_HOST_DIR` | `api/.env` (and root `.env` for docker-compose) | Path where API stores/reads uploaded files |

**Config mapping:** `api/config/custom-environment-variables.json` maps `UPLOAD_HOST_DIR` to `config.upload.path`

### Docker Environment

In `docker-compose-prod.yml`, the API service mounts the upload directory:

```yaml
api:
  environment:
    - UPLOAD_HOST_DIR=${UPLOAD_HOST_DIR}
  volumes:
    - ${UPLOAD_HOST_DIR}:${UPLOAD_HOST_DIR}
```

### Development

```bash
# api/.env.default
UPLOAD_HOST_DIR=/opt/sca/data/uploads
```

The `init_data_dirs` container creates the upload directory on startup.
The `landing_volume` Docker volume mounts at `/opt/sca/data`.

### Production

Set `UPLOAD_HOST_DIR` to an appropriate path on your production filesystem:
```bash
# Root .env (for docker-compose volume mount)
UPLOAD_HOST_DIR=/path/to/your/uploads/dir

# api/.env (also needs this, or passed via docker-compose environment)
UPLOAD_HOST_DIR=/path/to/your/uploads/dir
```

---

## API Endpoints

### Upload Management (all under `/datasets/uploads`)
**Create & Complete:**
- `POST /datasets/uploads` - Create dataset and upload log
- `POST /datasets/uploads/:id/complete` - Register TUS completion, move files

**Query:**
- `GET /datasets/uploads` - List all uploads (with filters)
- `GET /datasets/uploads/:username` - List user's uploads
- `GET /datasets/uploads/:id/logs` - Get upload log by dataset ID
- `GET /datasets/uploads/:datasetId/status` - Get upload status by dataset ID
- `GET /datasets/uploads/:id/upload-log` - Get upload log by dataset ID

**Update:**
- `PATCH /datasets/uploads/:id` - Update upload metadata (with ownership check)
- `PATCH /datasets/uploads/:id/upload-log` - Update upload log metadata

**Worker Endpoints:**
- `GET /datasets/uploads/stalled` - Get stalled uploads needing processing
- `GET /datasets/uploads/failed` - Get failed uploads eligible for retry
- `GET /datasets/uploads/expired` - Get expired uploads
- `GET /datasets/uploads/all-process-ids` - Get all upload process IDs
- `GET /datasets/uploads/by-status` - Get uploads by status

**Note:** All `:id` parameters refer to `dataset_id` (not upload_log_id) for REST consistency.

### TUS Protocol Endpoints (mounted at `/uploads/files`)
- `POST /uploads/files` - Create TUS upload
- `PATCH /uploads/files/:id` - Send file data (resumable)
- `HEAD /uploads/files/:id` - Check upload offset/status
- `OPTIONS /uploads/files` - CORS preflight

**Authentication:** TUS endpoints use standard Bearer token from `authenticate` middleware.

---

## Polling Job

**Script:** `workers/workers/scripts/manage_upload_workflows.py`

**Schedule:**
- Dev: Every 30s via background loop in `entrypoint.sh`
- Prod: Every 1 min via PM2 cron in `ecosystem.config.js`

**Process:**
1. Fetch uploads with `UPLOADED` status (older than 30s threshold)
2. Verify integrity (checksum or file existence)
3. Start `integrated` workflow directly (no `process_dataset_upload` step)
4. Update status to `COMPLETE` or `VERIFICATION_FAILED`

---

## UI Upload Stepper

The upload UI (`UploadDatasetStepper.vue`) has a 4-step process:

1. **Select Files** - Choose files/directory and file type
2. **General Info** - Dataset type, project, source data, source data product
3. **Genomic Details** - Genome type, assembly
4. **Upload** - Review and initiate upload

**File Type Field Location (Updated 2026-02-09):**
- File Type field moved from Step 3 (Genomic Details) to Step 1 (Select Files)
- Positioned above the file selector/file selection table for better UX
- Matches Import stepper layout consistency

**Source Data Product Field (Added 2026-02-09):**
- New "Assign source Data Product" field in Step 2 (General Info), after Source Instrument
- Only shown when Dataset Type is DATA_PRODUCT AND File Type (analysis_type) is FASTQ
- Establishes parent-child lineage in `dataset_hierarchy` table
- Automatically hidden and cleared if Dataset Type or File Type changes to non-qualifying values
- **Access Control:** Dropdown filters Data Products to show only those the user has access to

---

## UI Behavior

### Success Flow
1. TUS upload completes → UI calls `/complete`
2. `/complete` succeeds → Green success message, button disabled

### Failure Flow
1. `/complete` fails → Warning message, "Retry Registration" button appears
2. User clicks Retry → Calls `/complete` again

### Upload Logs Table
- Only shows uploads with `process_id` (hides incomplete/orphaned uploads)
- Status column shows icons like Import Log table (spinner/check/warning/error)
- Polls for status updates on uploads with active workflows or pending processing

---

## Removed Components (Cleanup Reference)

The `process_dataset_upload` workflow was removed during TUS migration.

**Old flow:**
- UI → API → `process_dataset_upload` workflow → `integrated` workflow

**New flow:**
- UI → API → Polling job → `integrated` workflow directly

**What to remove from forks that have the old system:**
- `workers/tasks/process_dataset_upload.py` (if exists)
- References in `workers/api.py`, `api/constants.js`, `api/routes/`, `ui/services/`

---

## Changelog

### 2026-02-11 - API Route Standardization

**What Changed:**
- Fixed `GET /datasets/uploads/:id/logs` to accept `dataset_id` instead of `upload_log_id`
- All routes under `/datasets/uploads/:id/...` now consistently use `dataset_id` as the `:id` parameter
- Updated UI service method: `getUploadLogById()` → `getUploadLogByDatasetId()`

**Why:**
- Maintains REST convention: resource hierarchy should match URL structure
- Under `/datasets/...` routes, `:id` should always refer to `dataset_id`

### 2026-02-11 - Schema Refactor: Direct Dataset Linking

**Major Schema Change:** Simplified upload log schema by removing audit_log intermediary.

**Schema Changes:**
- `dataset_upload_log.audit_log_id` removed, replaced with `dataset_id`
- `dataset.create_method` added (moved from `dataset_audit.create_method`)
- Upload logs now link directly to datasets via `dataset_id` foreign key

**Route Consolidation:**
- All upload routes moved from `/api/uploads/*` to `/api/datasets/uploads/*`
- `:id` parameter consistently refers to `dataset_id` across all routes

**Query Simplification:**
- Old: `where: { audit_log: { dataset_id, create_method: 'UPLOAD' } }`
- New: `where: { dataset_id }`

**Migration:** `20260211_refactor_upload_import_logs_remove_audit_relation`

### 2026-02-10 - Upload Details Page

**Added:**
- `/uploads/[id].vue` page for viewing individual upload details
- Shows comprehensive upload metadata (status, checksums, process IDs, failure reasons)
- Displays real-time verification logs from worker processes
- Auto-refreshes logs every 10 seconds with countdown indicator
- Added "Upload Details" link column to Dataset Uploads table (admin only)

### 2026-02-05 - Async Upload Verification Implementation

**Major Feature:** Implemented asynchronous upload integrity verification.

**New Upload States:**
- `VERIFYING`: Integrity verification in progress (async Celery task)
- `VERIFIED`: Integrity verified, ready to trigger workflow
- `PERMANENTLY_FAILED`: Max retries exceeded

**Celery Task (`verify_upload_integrity`):**
- Standalone task - fire-and-forget with status tracking
- Streaming BLAKE3 hash with 16MB chunks
- 24-hour timeout
- Auto-retry (max 3 attempts, 60s delay)

**Script Flow (`manage_upload_workflows.py`):**
1. `UPLOADED` → Set `VERIFYING` → Spawn task → Persist task ID
2. `VERIFYING` → Check task state → Handle all failure modes
3. `VERIFIED` → Trigger integrated workflow → Set `COMPLETE`

### 2026-02-04
- **Schema changes:** Renamed `tus_id` → `process_id`, added `metadata` JSON field
- **Added `VERIFICATION_FAILED` status**

### 2026-02-03
- **Major Update:** Migrated from chunk-based upload to TUS protocol
- **Architecture Change:** TUS server now runs in API service

---

## Pending Work

1. **Orphan Detection:** TUS uploads that complete but fail to register (no `process_id` in DB) need detection/cleanup mechanism.

---

**Last Updated:** 2026-02-11

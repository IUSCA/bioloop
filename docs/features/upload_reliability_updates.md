# Upload Reliability Updates (Mar 2026)

This document summarizes the upload-related code changes made in this session.

## Scope

The updates focus on reducing browser/proxy upload failures, making TUS lock-contention behavior less noisy, and improving upload UX discoverability.

## Changes Made

### 1) Bounded parallel uploads in UI

**File:** `ui/src/components/dataset/upload/UploadDatasetStepper.vue`  
**File:** `ui/src/config.js`

- Replaced unbounded `Promise.allSettled` fan-out with a bounded worker pool.
- Added configurable upload concurrency:
  - `config.upload.max_concurrent_files`
  - env: `VITE_UPLOAD_MAX_CONCURRENT_UPLOADS`
  - default: `4`

**Why:** prevents browser/network resource exhaustion (`ERR_INSUFFICIENT_RESOURCES`) when uploading large directories with many files.

---

### 2) TUS retry timing hardening

**File:** `ui/src/components/dataset/upload/UploadDatasetStepper.vue`

- Updated TUS `retryDelays` so the first retry is no longer immediate.
- Changed first delay from `0` to `1000` ms.

**Why:** reduces immediate retry collisions against still-held upload locks (`lock acquired` contention).

---

### 3) TUS chunk sizing for proxy compatibility

**File:** `ui/src/components/dataset/upload/UploadDatasetStepper.vue`  
**File:** `ui/src/config.js`

- Added `chunkSize` to `tus.Upload(...)`.
- Added configurable chunk size:
  - `config.upload.tus_chunk_size_bytes`
  - env: `VITE_UPLOAD_TUS_CHUNK_SIZE_BYTES`
  - default: `25 MB`

**Why:** avoids `413 Content Too Large` for large single files when upstream proxies enforce request-size limits.

---

### 4) TUS lock-contention logging level

**File:** `api/src/services/upload/UploadService.js`

- Added lock-contention detection helper.
- In `onResponseError`, errors that are clearly lock contention (`423` or `lock acquired`) are logged as `warn` instead of `error`.

**Why:** keeps expected transient contention from obscuring real failures in API logs.

---

### 5) Upload details tooltip in Dataset info

**File:** `ui/src/components/dataset/DatasetInfo.vue`

- Added a `va-popover` tooltip to the upload-details icon shown in **Created via** for upload-created datasets (admin-visible link).

**Why:** improves discoverability of the upload details page.

## Operational Note

The repository nginx config currently sets `client_max_body_size 100M` in `nginx/conf/app.conf`.  
Chunked TUS uploads mitigate this on the client side, but raising proxy body limits may still be appropriate for your deployment.

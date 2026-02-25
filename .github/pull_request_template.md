**Description**

This PR completely rewrites the dataset upload feature, replacing the legacy chunk-based upload system with a modern, resumable upload architecture based on the TUS protocol.

**Key Architecture Changes:**
- **TUS Protocol**: Replaces custom chunk-based uploads with standardized resumable uploads
- **BLAKE3 Checksums**: End-to-end upload integrity verification using modern cryptographic hashing
- **API-driven Uploads**: API service directly manages TUS uploads (eliminates `secure_download` service from upload path)
- **Polling-based Workflow**: Worker-side polling mechanism detects completed uploads and triggers processing
- **Direct Dataset Linking**: `dataset_upload_log` records directly link to `dataset` records (simplified schema)

**Related Issue(s)**


**Changes Made**

- [x] Feature added - Complete upload system rewrite
- [x] Code refactored - All upload-related code across API/UI/Workers
- [x] Schema changes - Database models updated for new upload architecture
- [x] Documentation updated - Added comprehensive upload workflow documentation
- [x] Old code removed - Legacy chunk upload system and OAuth upload tokens

**Detailed Changes by Service**

### Database Schema (`api/prisma/schema.prisma`)
- **`dataset_upload_log`**: Restructured to include `dataset_id` (direct link), `process_id`, `retry_count`, `metadata`; removed `audit_log_id`
- **`dataset`**: Added `create_method` field (UPLOAD/IMPORT/STAGE/INTEGRATED)
- **`upload_status`**: Updated enum to include new statuses (VERIFYING, VERIFIED, VERIFICATION_FAILED, PERMANENTLY_FAILED)
- **`dataset_audit`**: Removed `create_method` and upload log relation
- **`file_upload_log`**: Removed (chunk-based upload table)
- **`worker_process`**: Added `metadata` field; made `workflow_id` optional

### API Service (`api/`)
- **New Files**:
  - `src/services/upload.js` - TUS server configuration and upload management
  - `src/middleware/tus.js` - TUS protocol middleware
  - `src/routes/datasets/uploads.js` - Upload endpoints (`/datasets/uploads/*`)
- **Modified**:
  - `src/services/dataset.js` - Removed `initiateUploadWorkflow`; updated `buildDatasetCreateQuery`; updated `has_workflow_access` to remove old upload workflows
  - `src/services/accesscontrols.js` - Removed `PROCESS_DATASET_UPLOAD` and `CANCEL_DATASET_UPLOAD` from user permissions
  - `src/constants.js` - Added new upload statuses
  - `app.js` - Mounted TUS server middleware
  - `config/default.json` - Added TUS configuration
  - `.env.default` - Added `UPLOAD_HOST_DIR`
- **Removed**:
  - `src/routes/uploads.js` - Old chunk upload routes
  - `src/services/auth.js::get_upload_token` - OAuth upload tokens no longer used
- **Dependencies**: Added `@tus/server`, `@tus/file-store`; removed `spark-md5`

### Workers Service (`workers/`)
- **New Files**:
  - `workers/scripts/manage_upload_workflows.py` - Main polling job for TUS upload lifecycle
  - `workers/scripts/verify_upload_integrity.py` - BLAKE3 verification subprocess
  - `workers/tasks/verify_upload.py` - Celery task for async verification
  - `workers/upload.py` - BLAKE3 manifest hash utilities
  - `workers/scripts/__init__.py` - Package marker
- **Modified**:
  - `workers/api.py` - Added upload management API client functions
  - `workers/constants/upload.py` - Added new upload statuses
  - `workers/constants/workflow.py` - Removed `PROCESS_DATASET_UPLOAD` and `CANCEL_DATASET_UPLOAD`
  - `bin/entrypoint.sh` - Added background polling job for `celery_worker` type
- **Dependencies**: Python packages for BLAKE3 hashing

### UI Service (`ui/`)
- **New Files**:
  - `src/services/upload/checksum.js` - BLAKE3 manifest checksum computation
  - `src/pages/datasets/uploads/index.vue` - Upload list page
  - `src/pages/datasets/uploads/[id].vue` - Upload details page
  - `src/pages/datasets/uploads/new.vue` - New upload page
- **Modified**:
  - `src/components/dataset/upload/UploadDatasetStepper.vue` - **Converted to 3-step process** (Select Files → General Info → Upload); removed Genomic Details step, Analysis Type field, and Source Data Product field
  - `src/components/dataset/upload/UploadedDatasetDetails.vue` - Removed props for genomic fields, file type, and source data product
  - `src/services/dataset.js` - Updated for new upload API endpoints
  - `src/constants.js` - Added new upload statuses
- **Removed**: OAuth token handling, `spark-md5` chunking logic
- **Dependencies**: Added `tus-js-client`, `hash-wasm`; removed `spark-md5`

**Checklist**

Before submitting this PR, please make sure that:

- [x] Your code passes linting and coding style checks.
- [x] Documentation has been updated to reflect the changes.
- [x] You have reviewed your own code and resolved any merge conflicts.
- [ ] You have requested a review from at least one team member.
- [ ] Any relevant issue(s) have been linked to this PR.

**Post-Merge Actions Required**

1. **Database Migration**: Run Prisma migration to update schema
   ```bash
   cd api && npx prisma migrate deploy
   ```

2. **Environment Variables**: Ensure the following are set:
   - `UPLOAD_HOST_DIR` - Directory for TUS uploads (API and Workers)
   - Update any existing upload-related env vars per new architecture

3. **Worker Deployment**: Deploy updated worker service with new polling job

4. **Testing**: 
   - Test end-to-end upload flow (file selection → upload → verification → integration)
   - Verify BLAKE3 checksum validation (if enabled)
   - Test upload retry/failure scenarios
   - Verify upload status transitions

**Additional Information**

**Migration from Old System:**
- Existing datasets uploaded via the old chunk-based system remain unchanged
- The new TUS-based upload system is independent and will not affect existing upload logs
- Old upload-related files (`process_dataset_upload.py`, `cancel_dataset_upload.py`, `manage_pending_dataset_uploads.py`) remain in the codebase for backward compatibility but are not used by the new system

**Performance & Reliability Improvements:**
- Resumable uploads survive network interruptions
- Parallel chunk uploads for better throughput
- Background verification prevents UI blocking
- Automatic retry logic for transient failures (up to 3 retries)
- Exponential backoff for failed uploads
- Admin notifications for permanently failed uploads

**Known Limitations:**
- BLAKE3 verification is optional (not enforced by default)
- Legacy worker scripts remain but are not invoked by new upload flow
- The `manage_pending_dataset_uploads.py` polling script from the old system is superseded by `manage_upload_workflows.py`

**Testing Recommendations:**
1. Upload small test files first
2. Test network interruption scenarios (pause/resume)
3. Verify workflow integration (INTEGRATED workflow triggering)
4. Check upload status transitions through the polling job
5. Validate error handling and retry logic
6. Test concurrent uploads from multiple users

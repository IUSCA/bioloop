## Description

This PR rewrites dataset uploads compared to `origin/main`, replacing the legacy chunk-upload implementation with a TUS-based resumable architecture coordinated across UI, API, and workers.

Core behavior change:
- Old flow: custom chunk API + upload token path + dedicated upload-processing tasks.
- New flow: `POST /datasets/uploads` registration -> TUS upload (`/api/uploads/files`) -> `POST /datasets/uploads/:id/complete` -> worker-managed status pipeline (`UPLOADED -> VERIFYING -> VERIFIED -> COMPLETE`).

Diff size: ~102 files changed. This PR description is intentionally organized as a reviewer map.

## Related Issue(s)

- Upload rewrite epic / PR feedback thread
- Follow-up issues for remaining e2e hardening and large-file validation

## Changes Made

- [x] Feature added - TUS-based resumable upload pipeline
- [x] Bug fixed - multi-file complete handling, zero-byte upload edge case compatibility
- [x] Code refactored - removed legacy chunk/token upload architecture
- [x] Tests changed - upload e2e specs and worker upload test coverage added/updated
- [x] Documentation updated - design/feature docs and deployment guidance for rewrite
- [x] Other changes - schema and status model rewrite for upload lifecycle

## Reviewer Guide (Suggested Order)

### 1) Data Model + Migration (source of truth first)

Start here to understand status/state semantics and schema shifts:
- `api/prisma/migrations/20260311000000_upload_rewrite/migration.sql`
- `api/prisma/schema.prisma`
- `api/src/constants.js`
- `workers/workers/constants/upload.py`

What to verify:
- `dataset_upload_log` now links directly to `dataset` (`dataset_id`).
- Upload status model includes `VERIFYING`, `VERIFIED`, `VERIFICATION_FAILED`, `PERMANENTLY_FAILED`, etc.
- `create_method` ownership moved to dataset-level lifecycle usage.

### 2) API Upload Boundary + TUS Integration

Main files:
- `api/src/routes/datasets/uploads.js`
- `api/src/middleware/tus.js`
- `api/src/services/upload/UploadService.js`
- `api/src/services/upload/TestableFileStore.js`
- `api/src/services/upload/tusUtils.js`
- `api/src/app.js`

What changed:
- API now hosts TUS and owns upload registration/finalization.
- Upload completion/failure paths are idempotent and status-driven.
- TUS metadata and storage handling replace legacy chunk endpoints.
- Legacy route removed: `api/src/routes/uploads.js`.

### 3) Worker Pipeline (post-upload orchestration)

Main files:
- `workers/workers/scripts/manage_upload_workflows.py`
- `workers/workers/scripts/verify_upload_integrity.py`
- `workers/workers/tasks/verify_upload.py`
- `workers/workers/upload.py`
- `workers/bin/entrypoint.sh`
- `workers/bin/start_uploads_poller.sh`

What changed:
- `manage_upload_workflows.py` now drives lifecycle progression and retries.
- Verification is async and explicit (`VERIFYING`/`VERIFIED`/`VERIFICATION_FAILED`).
- Removed old upload tasks/scripts:
  - `workers/workers/tasks/process_dataset_upload.py`
  - `workers/workers/tasks/cancel_dataset_upload.py`
  - `workers/workers/scripts/manage_pending_dataset_uploads.py`

### 4) UI Upload Experience + Routes

Main files:
- `ui/src/components/dataset/upload/UploadDatasetStepper.vue`
- `ui/src/services/upload/index.js`
- `ui/src/services/upload/checksum.js`
- `ui/src/pages/datasets/uploads/new.vue`
- `ui/src/pages/datasets/uploads/index.vue`
- `ui/src/pages/datasets/uploads/[id].vue`
- `ui/src/components/dataset/upload/UploadStatusBadge.vue`
- `ui/src/components/dataset/upload/UploadStatusIcon.vue`

What changed:
- Upload UI now uses TUS client flow with checksum support.
- Upload route moved from legacy `datasetUpload/*` to `datasets/uploads/*`.
- Status presentation aligned with new upload lifecycle.
- Removed legacy token/chunk clients:
  - `ui/src/services/upload/token.js`
  - `ui/src/services/upload/uploadApi.js`
  - `ui/src/pages/datasetUpload/index.vue`

### 5) Config + Dependency + Runtime Wiring

Main files:
- `api/config/default.json`
- `api/.env.default`
- `docker-compose-prod.yml`
- `api/package.json`, `api/package-lock.json`
- `ui/package.json`, `ui/package-lock.json`
- `workers/pyproject.toml`, `workers/poetry.lock`

What to verify:
- TUS/server dependencies and checksum dependencies are present.
- Upload host path/storage config is correctly wired.
- Service startup wiring supports upload poller and new endpoints.

### 6) Test + Docs Pass

Representative files:
- `tests/src/tests/view/authenticated/upload/*`
- `workers/tests/upload/test_manage_upload_workflows.py`
- `workers/tests/upload/test_verify_upload_integrity.py`
- `docs/design/upload-rewrite.md`
- `docs/features/dataset_upload.md`

What changed:
- Existing upload e2e tests updated for new routes/stepper semantics.
- New worker tests cover workflow management + integrity verification.
- Design docs now reflect TUS architecture and worker-orchestrated lifecycle.

## Behavioral Deltas From `origin/main`

- Upload bytes no longer pass through legacy chunk upload endpoints.
- Upload session completion is explicit and then processed asynchronously.
- Verification is now a first-class state transition, not implicit in old processing.
- Failure handling and retries are state-machine driven (including terminal failure statuses).
- Legacy OAuth upload token path for chunk uploads removed.

## Screenshots (if applicable)

- Upload stepper and status badges
- Upload list/details pages (`/datasets/uploads`)

## Checklist

- [ ] Lint/style checks pass in changed services.
- [x] Documentation updated for architecture and workflow changes.
- [x] Self-review completed; no unresolved merge conflicts.
- [ ] Requested review from API, UI, and worker owners.
- [ ] Linked all tracking issues/follow-ups.

## Additional Information

Known follow-up areas:
- Complete remaining large-file and adversarial upload validation matrix.
- Continue replacing/expanding upload e2e coverage for all edge scenarios.
- Validate any remaining open PR feedback comments against final behavior.
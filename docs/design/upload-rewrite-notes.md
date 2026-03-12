# Upload Rewrite — Design Doc Notes

Working notes for the upcoming Upload Rewrite design document.
Add items here as they surface during development; flesh out each section when
writing the formal doc.

---

## Architecture / Key Design Decisions

- TUS protocol for resumable uploads (server: `@tus/server`, store: `@tus/file-store`).
- Post-upload processing is deliberately **not** triggered from TUS completion
  hooks — the UI calls `POST /datasets/uploads/:id/complete` explicitly instead,
  to avoid response-stream conflicts with async operations inside a hook.
- Two-step upload registration flow:
  1. `POST /datasets/uploads/` — creates the dataset + upload log, returns `process_id`.
  2. `POST /datasets/uploads/:id/complete` — moves files from TUS staging to
     `origin_path`, marks log as `UPLOADED`.
- `origin_path` is set deterministically at dataset creation time
  (`/uploads/{type}/{id}/{name}`) so it does not depend on the upload completing.

---

## Configuration / Environment Variables

- `upload.path` / `UPLOAD_HOST_DIR` — filesystem root where TUS stores chunks.
- `upload.max_file_size_bytes` / `UPLOAD_MAX_FILE_SIZE_BYTES` — hard per-file
  cap enforced server-side by TUS. **Must be kept in sync with the UI value.**
- `VITE_UPLOAD_MAX_FILE_SIZE_BYTES` — UI-side counterpart; used for immediate
  client-side rejection before TUS even starts, providing a better UX than
  waiting for a mid-upload server rejection.
  Default: `107374182400` (100 GB) in both API and UI configs.

> ⚠ When deploying to a new environment, both the API env var and the UI env
> var must be set to the same value. Document this in the deployment checklist.

---

## Access Control

- `POST /:id/complete` and `PATCH /:id`: ownership checked via
  `dataset_audit.action = 'create'` row.
  - Pre-branch datasets have no such row; `get_dataset_creator()` returns `null`
    → fallback to `update:any` check → admins/operators pass, regular users get 403.
  - See `api/src/services/upload/` and `api/src/services/dataset.js`.

---

## Database / Schema Notes

- `dataset.create_method` (`DATASET_CREATE_METHOD` enum: UPLOAD, IMPORT, SCAN, ON_DEMAND)
  was moved from `dataset_audit` to `dataset` in this branch.
- Migration `20260311000000_backfill_dataset_create_method` backfills the value
  from `dataset_audit.create_method` for pre-existing rows and drops the column
  from `dataset_audit`.
- `dataset_audit.action = 'create'` is the canonical way to find a dataset's
  creator; introduced in this branch (not in `origin/main`).

---

## Testing / Failure Simulation

- `TestableFileStore` (`api/src/services/upload/TestableFileStore.js`) intercepts
  `write()` and can inject a mid-upload failure after writing 1 MB.
- Activated per-upload via the `X-Simulate-Failure` request header (intercepted
  by TUS middleware). Flag lives in `global.tusFailureSimulation` (Map keyed by
  TUS upload ID), consumed once, then cleared.
- Only honoured in non-production environments.

---

## UI Notes

- `UploadDatasetStepper.vue`: client-side file-size validation in `onFilesAdded`
  and `onDirectoryAdded` uses `config.upload.max_file_size_bytes`.
- Upload history view (`ui/src/pages/datasets/uploads/index.vue`) uses
  `audit_logs[0].user` (pre-filtered to `action='create'`) to show who initiated
  each upload — relies on the `INCLUDE_DATASET_UPLOAD_LOG_RELATIONS` constant.

---

## Pre-PR Checklist

- [ ] Run linter across changed files (`ui` and `api`).
- [ ] Check that no design/scratch files or temporary snippets left over from the
      original design phase still exist (e.g. draft docs, commented-out prototype
      code, `TODO`/`FIXME` notes that were only meant for the design stage).
- [ ] Install dependencies across `ui`, `api`, and `workers` to verify nothing is missing.
- [ ] Test multi-file upload in "files" selection mode (not directory): verify ALL files
      end up at origin_path, not just the last one. Currently handleUploadComplete only
      sends the last process_id to POST /:id/complete — the /complete endpoint (and
      possibly the API design) may need to accept all process_ids for multi-file uploads.
- [ ] Review any remaining unaddressed Copilot PR comments before merge.

---

## Open Questions / TODOs for Formal Doc

- [ ] Document the `VERIFYING` / `VERIFIED` / `VERIFICATION_FAILED` status
      transitions and the async Celery task that drives them.
- [ ] Describe the worker-side upload workflow
      (`manage_upload_workflows.py`, `process_dataset_upload.py`).
- [ ] Describe stalled / failed / expired upload detection and retry logic.
- [ ] Document the manifest hash computation and where it is stored.
- [ ] Clarify the `dataset_upload_log` ↔ `dataset_audit` relationship after the
      schema restructure (this branch removed the `audit_log_id` FK).

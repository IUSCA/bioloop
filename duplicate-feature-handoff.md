# Duplicate Detection Feature Handoff

## Purpose

This handoff is for the next agent working on duplicate detection in `bioloop-5`.
It captures the current implementation, where logic lives, what is already tested,
and which decisions are currently locked.

## Current Direction (Important)

- Keep duplicate detection in `inspect` for now.
- Do not move duplication analysis to `archive` yet.
- The "defer duplication to archive after tar generation" idea was discussed and intentionally not adopted at this time.

## High-Level Flow (Current Behavior)

1. Dataset runs the `integrated` workflow.
2. `inspect_dataset` computes metadata and file hashes, writes `dataset_file`, then marks state `INSPECTED`.
3. If `enabled_features.duplicate_detection.enabled` is true:
   - worker runs duplicate candidate lookup (Jaccard on MD5 overlap),
   - if above threshold, worker registers duplicate + launches async comparison task,
   - inspect raises `DuplicateDetected` to stop the integrated workflow at inspect.
4. Async comparison task computes six report buckets and persists a full comparison report.
5. API marks duplicate dataset `DUPLICATE_READY` once comparison is saved.
6. Operator/admin chooses Accept or Reject via duplication UI.

## Feature Flags and Thresholds

- API config: `api/config/default.json`
  - `enabled_features.duplicate_detection.enabled` (feature toggle only)
  - `dataset_duplication.jaccard_threshold`
  - `dataset_duplication.concurrent_inspection_wait_timeout_seconds`
- Worker config mirrors the same keys in `workers/workers/config/common.py`.

## Worker Implementation Map

- `workers/workers/tasks/inspect.py`
  - inspection + metadata writes
  - sets dataset state to `INSPECTED`
  - calls `run_duplicate_detection(...)` when feature enabled
- `workers/workers/dataset_duplication.py`
  - `_is_actively_inspecting(...)`
  - `wait_for_concurrent_inspections(...)`
  - `run_duplicate_detection(...)`
  - registers duplicate + starts compare task + raises `DuplicateDetected` for true duplicates
- `workers/workers/tasks/compare_duplicate_datasets.py`
  - standalone Celery task
  - computes six check buckets:
    - `EXACT_CONTENT_MATCHES`
    - `SAME_PATH_SAME_CONTENT`
    - `SAME_PATH_DIFFERENT_CONTENT`
    - `SAME_CONTENT_DIFFERENT_PATH`
    - `ONLY_IN_INCOMING`
    - `ONLY_IN_ORIGINAL`
  - saves result through one API call
- `workers/workers/tasks/purge_duplicate_dataset_resources.py`
  - used by reject workflow to purge duplicate resources
- `workers/workers/tasks/declarations.py`
  - task wiring and retry behavior
  - `inspect_dataset` does not retry on `DuplicateDetected`

## API Implementation Map

- `api/src/routes/datasets/duplication.js`
  - `GET /datasets/duplication/config`
  - `GET /datasets/duplication/:id/candidate`
  - `POST /datasets/duplication/:id`
  - `PUT /datasets/duplication/:id/comparison`
  - `PATCH /datasets/duplication/:id/comparison/progress`
  - `POST /datasets/duplication/:id/accept`
  - `POST /datasets/duplication/:id/reject`
- `api/src/services/datasetDuplication.js`
  - duplicate registration transaction
  - comparison save transaction
  - accept/reject business logic
  - concurrent duplicate rejection on accept
  - relation transfer from original to accepted duplicate
- `api/src/constants.js`
  - duplicate states and comparison statuses
- `api/src/services/accesscontrols.js`
  - `datasets_duplication` permission resource

## States and Statuses in Use

- Dataset states:
  - `INSPECTED`
  - `DUPLICATE_REGISTERED`
  - `DUPLICATE_READY`
  - `DUPLICATE_REJECTED`
  - `OVERWRITTEN`
- Comparison statuses:
  - `PENDING`
  - `RUNNING`
  - `COMPLETED`
  - `NOT_DUPLICATE`
  - `FAILED`

## Workflow Registry Notes

From `api/config/default.json`:

- `integrated`: includes `inspect_dataset` then `archive_dataset`
- `accept_duplicate_dataset`: archive/stage/validate/setup_download
- `reject_duplicate_dataset`: `purge_duplicate_dataset_resources`

Operational consequence:
- True duplicate detection currently stops integrated at inspect and moves to duplicate review flow.

## Testing and Fixtures

- Manual worker scripts under `workers/workers/scripts/duplicate_testing/`
  - cases 01 through 10
  - runner: `simulate_all_test_cases.py`
- Readme:
  - `workers/workers/scripts/duplicate_testing/README.md`
- Current script coverage includes:
  - full duplicate
  - near miss
  - partial overlap
  - modified same-path content
  - same-content different-path
  - summary-bucket baseline and subset behavior

## Recent Refactor to Know

- Duplicate logic previously embedded in `inspect.py` was moved into
  `workers/workers/dataset_duplication.py`.
- `inspect.py` now calls the helper module rather than holding all duplication logic inline.

## Known Open Items

- Notification hooks are still placeholders in API/service flow.
- Comparison log surfacing in UI may still need refinement depending on role/access requirements.
- Final hardening/testing pass is still needed before merge (worker tests + UI checks + lint).

## If You Revisit "Duplication in Archive" Later

If this direction is reopened in the future, evaluate all of the following together:

- archive retry idempotency with partial tar writes
- duplicate detection trigger point and workflow state semantics
- accept/reject API assumptions tied to inspect-time registration
- async comparison task enqueue semantics and deduplication keys
- cost impact of building tar before duplicate rejection

Until explicitly requested, keep the current inspect-time detection design.

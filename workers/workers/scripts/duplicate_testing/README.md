# Duplicate Detection — Manual Test Scripts

These scripts create real datasets through the full worker pipeline to exercise
the duplicate-detection feature end-to-end.  Each case targets a specific
scenario or edge case in the detection flow.

## Prerequisites

- Docker stack is running and healthy (`api`, `celery_worker`, `rhythm`,
  `signet`, `postgres` all healthy).
- The `duplicate_detection` feature flag is enabled in the API config
  (`enabled_features.duplicate_detection.enabled = true`).

All scripts must run **inside the `celery_worker` container**:

```bash
docker compose exec celery_worker python -m workers.scripts.duplicate_testing.<case>
```

Run all or selected cases with the package runner:

```bash
# all cases (concurrent by default)
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.simulate_all_test_cases

# specific cases
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.simulate_all_test_cases 5 6 9 10

# sequential mode
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.simulate_all_test_cases --sequential
```

Dataset directories are created under:

```
/opt/sca/data/duplicates_testing/   (inside the container)
```

This directory is separate from the `watch.py` source directory so datasets
are never auto-registered by the scanner — only by the scripts themselves.

---

## Cases

### Case 01 — Duplicate registered BEFORE original is INSPECTED

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_01_before_inspection
```

Both datasets are registered back-to-back without any wait.  The duplicate
worker's `wait_for_concurrent_inspections()` detects the in-flight original and
waits until it finishes inspection before running Jaccard detection.

| | Dataset | Files |
|---|---|---|
| Original | `dup-test--case-01-before-inspect--original--<ts>` | A B C D E |
| Duplicate | `dup-test--case-01-before-inspect--dup-of-original--<ts>` | A B C D E |

**Jaccard**: 5 / (5 + 5 − 5) = **1.0** → duplicate detected.  
**Estimated time**: ~5–8 min (concurrent inspection).

---

### Case 02 — Duplicate registered AFTER original is INSPECTED

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_02_after_inspection
```

The script waits for the original to reach `INSPECTED` before registering the
duplicate.  `wait_for_concurrent_inspections()` on the duplicate side returns
immediately (no older in-flight datasets).

| | Dataset | Files |
|---|---|---|
| Original | `dup-test--case-02-after-inspect--original--<ts>` | A B C D E |
| Duplicate | `dup-test--case-02-after-inspect--dup-of-original--<ts>` | A B C D E |

**Jaccard**: 1.0 → duplicate detected.  
**Estimated time**: ~10–15 min (sequential inspections).

---

### Case 03 — Near-miss (below Jaccard threshold, `_DUPLICATE_` name)

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_03_near_miss
```

The incoming dataset shares only 3 of 8 original files, producing a Jaccard
score of ≈ 0.27 — well below the 0.85 threshold.  Because the incoming dataset
name contains `_DUPLICATE_`, `inspect_dataset` records a
`dataset_duplication` entry with `comparison_status = NOT_DUPLICATE` so the UI
can surface an informational near-miss alert.

| | Dataset | Files | Jaccard |
|---|---|---|---|
| Original | `dup-test--case-03-near-miss--original--<ts>` | A B C D E F G H | — |
| Near-miss | `dup-test--case-03-near-miss--_DUPLICATE_near-miss-of-original--<ts>` | A B C X Y Z | 3/11 ≈ 0.27 |

**Jaccard**: 3 / (6 + 8 − 3) = 3/11 ≈ **0.27** → NOT a duplicate.  
**Estimated time**: ~10–15 min.

---

### Case 04 — Multiple duplicates of the same original

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_04_multiple_duplicates
```

Two duplicate datasets (dup-1, dup-2) both independently detect the same
original.  When an operator accepts either one via the UI, the API's
`reject_concurrent_active_duplicates()` logic automatically rejects the other.

| | Dataset | Files |
|---|---|---|
| Original | `dup-test--case-04-multiple-dups--<ts>` | file_01–file_05 |
| Dup-1 | `<original>--copy-id<id>_DUPLICATE_1` | file_01–file_05 |
| Dup-2 | `<original>--copy-id<id>_DUPLICATE_2` | file_01–file_05 |

**Jaccard** (each): 1.0 → both detected as duplicates.  
**After accepting one**: the other is auto-rejected; the original is soft-deleted (OVERWRITTEN).  
**Estimated time**: ~3–5 min (with `recency_threshold_seconds=60`).

---

### Case 05 — Partial match (Jaccard above threshold, non-100% report)

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_05_partial_match
```

The incoming dataset shares 18 of 19 files with the original — one file only in
incoming, one only in original.  The Jaccard score of 0.90 clears the default
0.85 threshold, so the dataset IS registered as a duplicate.  The comparison
report shows all four check categories with non-trivial values.

| | Dataset | Files |
|---|---|---|
| Original | `dup-test--case-05-partial-match--<ts>` | file_01–file_18 + file_original_01.dat |
| Duplicate | `<original>--copy-id<id>_DUPLICATE_1` | file_01–file_18 + file_incoming_01.dat |

**Jaccard**: 18 / (19 + 19 − 18) = 18/20 = **0.90** → duplicate detected.  
**Comparison report**:

| Check | Passed? | Count |
|---|---|---|
| Matching files | ✅ | 18 |
| Modified files | ✅ | 0 |
| Only in incoming | ⚠️ FAILED | 1 (`file_incoming_01.dat`) |
| Only in original | ⚠️ FAILED | 1 (`file_original_01.dat`) |

**Estimated time**: ~3–5 min (with `recency_threshold_seconds=60`).

---

### Case 06 — Modified files (MODIFIED_FILES check fails)

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_06_modified_files
```

The incoming dataset has the same 18 files as the original, plus one file
(`file_mod_01.dat`) that exists in both datasets under the same name but with
different content (different MD5).  This simulates a file that was changed
between dataset versions.

| | Dataset | Files |
|---|---|---|
| Original | `dup-test--case-06-modified-files--<ts>` | file_01–file_18 + file_mod_01.dat (v1) |
| Duplicate | `<original>--copy-id<id>_DUPLICATE_1` | file_01–file_18 + file_mod_01.dat (v2) |

**Jaccard**: 18 / (19 + 19 − 18) = 18/20 = **0.90** → duplicate detected.  
**Comparison report**:

| Check | Passed? | Count |
|---|---|---|
| Matching files | ✅ | 18 |
| Modified files | ⚠️ FAILED | 1 (`file_mod_01.dat`) |
| Only in incoming | ✅ | 0 |
| Only in original | ✅ | 0 |

**Estimated time**: ~3–5 min (with `recency_threshold_seconds=60`).

---

### Case 07 — All three difference checks fail

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_07_all_failures
```

The incoming dataset differs from the original in all three measurable ways:
one file is modified, one file exists only in the incoming dataset, and one
file exists only in the original.  25 shared files keep the Jaccard score above
the detection threshold.

| | Dataset | Files |
|---|---|---|
| Original | `dup-test--case-07-all-failures--<ts>` | file_01–file_25 + file_mod_01.dat (v1) + file_original_01.dat |
| Duplicate | `<original>--copy-id<id>_DUPLICATE_1` | file_01–file_25 + file_mod_01.dat (v2) + file_incoming_01.dat |

**Jaccard**: 25 / (27 + 27 − 25) = 25/29 ≈ **0.862** → duplicate detected.  
**Comparison report**:

| Check | Passed? | Count |
|---|---|---|
| Matching files | ✅ | 25 |
| Modified files | ⚠️ FAILED | 1 (`file_mod_01.dat`) |
| Only in incoming | ⚠️ FAILED | 1 (`file_incoming_01.dat`) |
| Only in original | ⚠️ FAILED | 1 (`file_original_01.dat`) |

**Estimated time**: ~3–5 min (with `recency_threshold_seconds=60`).

---

### Case 08 — Same content + different path/name

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_08_same_content_different_path
```

Incoming and original share one file by MD5 but under different paths. This
case validates that the report uses `SAME_CONTENT_DIFFERENT_PATH` instead of
misclassifying that pair as only-in-incoming + only-in-original.

---

### Case 09 — Baseline for exact-content and same-path summaries

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_09_same_path_same_content
```

Perfect overlap case focused on the new summary buckets:
- `EXACT_CONTENT_MATCHES` > 0
- `SAME_PATH_SAME_CONTENT` > 0
- all difference buckets = 0

---

### Case 10 — Exact-content superset of same-path matches

```bash
docker compose exec celery_worker \
  python -m workers.scripts.duplicate_testing.case_10_exact_content_subset
```

One file is moved/renamed (same MD5, different path), so:
- `EXACT_CONTENT_MATCHES` > `SAME_PATH_SAME_CONTENT`
- `SAME_CONTENT_DIFFERENT_PATH` fails with count 1
- other difference buckets remain 0

---

## Which cases produce a viewable duplication report?

| Case | Jaccard | Registered as duplicate? | Report visible? | Checks that fail |
|------|---------|--------------------------|-----------------|------------------|
| 01 | 1.00 (100%) | ✅ Yes | ✅ Yes | None (perfect match) |
| 02 | 1.00 (100%) | ✅ Yes | ✅ Yes | None (perfect match) |
| 03 | 0.27 (27%)  | ❌ No (below 0.85 threshold) | ❌ No | — |
| 04 | 1.00 (100%) | ✅ Yes | ✅ Yes | None (perfect match) |
| 05 | 0.90 (90%)  | ✅ Yes | ✅ Yes | ONLY_IN_INCOMING, ONLY_IN_ORIGINAL |
| 06 | 0.90 (90%)  | ✅ Yes | ✅ Yes | SAME_PATH_DIFFERENT_CONTENT |
| 07 | ≈0.862 (86%) | ✅ Yes | ✅ Yes | SAME_PATH_DIFFERENT_CONTENT, ONLY_IN_INCOMING, ONLY_IN_ORIGINAL |
| 08 | >= 0.85      | ✅ Yes | ✅ Yes | SAME_CONTENT_DIFFERENT_PATH |
| 09 | 1.00 (100%)  | ✅ Yes | ✅ Yes | None (summary baseline) |
| 10 | 1.00 (100%)  | ✅ Yes | ✅ Yes | SAME_CONTENT_DIFFERENT_PATH |

Case 03 is the only scenario that tests the below-threshold NOT_DUPLICATE path.
Cases 01/02/04/09 produce 100% similarity reports; cases 05/06/07/08/10 each
exercise different failure combinations in the comparison report.

---

## Timing

`await_stability` in Docker requires files to be unmodified for
`recency_threshold_seconds` before considering the dataset stable.
The value is configurable in `workers/workers/config/docker.py`:

- **Development/testing**: 60 s → ~1–2 min per dataset inspection
- **Production default**: 300 s (5 min) → ~5–8 min per dataset inspection

Scripts poll the API every 15 seconds and log the current state.

## Cleanup

Deletion of test datasets is intentionally disabled for now.  To remove them
manually, use the UI or the `delete_datasets.js` API script.

## File overlap and Jaccard scores

Files are created with deterministic content derived from their name.  Two
files with the same name (e.g. `file_01.dat`) will always produce the same MD5
checksum regardless of which dataset they belong to, enabling controlled Jaccard
scores without requiring real genomics data.

```
file_01.dat  MD5 = f(content("file_01.dat"))
file_01.dat  (in another dataset) → same MD5  →  counted as a matching file
file_incoming_01.dat → unique content  →  counted as only-in-incoming
```

Cases that exercise the `SAME_PATH_DIFFERENT_CONTENT` check (06, 07) use
`make_dataset_dir_mixed`, which accepts a `versioned_files` dict mapping
filenames to version numbers.  The same filename with a different version
number produces different bytes (and a different MD5), simulating a file that
was changed between dataset versions:

```
file_mod_01.dat  version=1  →  MD5 = A  (original dataset)
file_mod_01.dat  version=2  →  MD5 = B  (incoming dataset)
→ same path, different MD5 → counted as SAME_PATH_DIFFERENT_CONTENT
```

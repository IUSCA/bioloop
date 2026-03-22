"""
Case 03 — Near-miss: similarity detected but below the Jaccard threshold.

Scenario
--------
The incoming dataset shares several files with the original but not enough to
cross the duplicate_detection.jaccard_threshold (default 0.85).

Because the incoming dataset's name will contain '_DUPLICATE_' (added by the
app when the same name is registered twice), the inspect task records the
near-miss via register_duplicate(..., comparison_status='NOT_DUPLICATE')
so the UI can surface an informational alert about the similarity score.

Expected outcome
----------------
  original:    REGISTERED → READY → INSPECTED → ARCHIVED → STAGED
  near-miss:   REGISTERED → READY → INSPECTED → ARCHIVED → STAGED
               (no DUPLICATE_REGISTERED — it is NOT flagged as a duplicate)
               An API dataset_duplication record is written with
               comparison_status = 'NOT_DUPLICATE'.

NOTE: This case does NOT produce a viewable duplication report page because the
dataset never reaches DUPLICATE_REGISTERED.  For a partial match ABOVE the
threshold (viewable report with a non-100% score), see case_05_partial_match
(Jaccard 0.90).

File overlap
------------
  original:  file_A, file_B, file_C, file_D, file_E, file_F, file_G, file_H  (8 files)
  near-miss: file_A, file_B, file_C, file_X, file_Y, file_Z                  (6 files)
  common:    file_A, file_B, file_C  →  3 files
  Jaccard:   3 / (6 + 8 - 3) = 3/11 ≈ 0.27  (well below 0.85 threshold)

Naming convention
-----------------
  original dir and API name: dup-test--case-03--<timestamp>  (unique-checked)
  near-miss dir and API name: <original_name>--copy-id<original_id>_DUPLICATE_1
                               (unique-checked; _DUPLICATE_ token is required by
                                the inspect task to record the NOT_DUPLICATE entry
                                even when Jaccard is below threshold)

Usage (inside celery_worker container)
---------------------------------------
    python -m workers.scripts.duplicate_testing.case_03_near_miss
"""

import logging

from workers.scripts.duplicate_testing._common import (
    BASE_DIR,
    duplicate_name_and_dir,
    find_unique_name,
    make_dataset_dir,
    register_and_start,
    run_tag,
    setup_logging,
    wait_for_state,
    jaccard_note,
    latest_state,
)

logger = logging.getLogger(__name__)

CASE = 'case-03-near-miss'

# Files that will exist in both datasets (shared MD5s → counted as common).
SHARED_FILES = ['file_A.dat', 'file_B.dat', 'file_C.dat']

# Files exclusive to the original (not present in the near-miss dataset).
ORIGINAL_ONLY_FILES = ['file_D.dat', 'file_E.dat', 'file_F.dat', 'file_G.dat', 'file_H.dat']

# Files exclusive to the near-miss dataset (unique content, different MD5).
NEAR_MISS_ONLY_FILES = ['file_X.dat', 'file_Y.dat', 'file_Z.dat']

# Jaccard = 3 / (6 + 8 - 3) = 3/11 ≈ 0.27
_TOTAL_ORIGINAL = len(SHARED_FILES) + len(ORIGINAL_ONLY_FILES)    # 8
_TOTAL_NEAR_MISS = len(SHARED_FILES) + len(NEAR_MISS_ONLY_FILES)  # 6
_COMMON = len(SHARED_FILES)                                        # 3


def run() -> None:
    tag = run_tag()
    original_name = find_unique_name(f'dup-test--{CASE}--{tag}')

    logger.info('=' * 70)
    logger.info('Case 03: near-miss (below Jaccard threshold)')
    logger.info(f'  original name:  {original_name}')
    logger.info(
        f'  Jaccard:        {jaccard_note(_TOTAL_NEAR_MISS, _TOTAL_ORIGINAL, _COMMON)}'
        f'  (threshold ~0.85 → NOT a duplicate)'
    )
    logger.info('=' * 70)
    logger.info(
        'NOTE: The near-miss dataset name embeds _DUPLICATE_ directly — this is '
        'the token the inspect task checks to record a NOT_DUPLICATE entry even '
        'when the Jaccard score is below threshold. '
        'Total estimated time: ~10-15 min.'
    )

    # Step 1 — Create and register the original.
    logger.info('')
    logger.info('Step 1: creating and registering the original dataset...')
    original_dir = BASE_DIR / original_name
    make_dataset_dir(original_dir, SHARED_FILES + ORIGINAL_ONLY_FILES)
    original = register_and_start(original_name, original_dir)

    # Step 2 — Wait for the original to be INSPECTED before registering the near-miss.
    # We register after inspection so there is no concurrency ambiguity — the
    # near-miss's inspection will find the original cleanly.
    logger.info('')
    logger.info('Step 2: waiting for original to reach INSPECTED (~5-8 min)...')
    reached = wait_for_state(
        dataset_id=original['id'],
        target_states=['INSPECTED', 'ARCHIVED', 'STAGED'],
        label=f'original id={original["id"]}',
    )
    if not reached:
        logger.error('Original did not reach INSPECTED within timeout.')
        return

    # Step 3 — Derive a unique near-miss name that encodes the original's ID and
    # embeds the _DUPLICATE_ token.  The token causes the inspect task to record
    # a NOT_DUPLICATE duplication entry even when Jaccard is below threshold.
    dup_name, dup_dir = duplicate_name_and_dir(original)
    logger.info('')
    logger.info('Step 3: original is INSPECTED — creating and registering the near-miss...')
    logger.info(f'  near-miss dir:  {dup_dir.name}')
    make_dataset_dir(dup_dir, SHARED_FILES + NEAR_MISS_ONLY_FILES)
    near_miss = register_and_start(dup_name, dup_dir)

    # Step 4 — The near-miss should complete integration normally (NOT a duplicate).
    logger.info('')
    logger.info(
        'Step 4: waiting for near-miss to complete inspection '
        '(expected to reach ARCHIVED/STAGED, NOT DUPLICATE_REGISTERED)...'
    )
    wait_for_state(
        dataset_id=near_miss['id'],
        target_states=['ARCHIVED', 'STAGED', 'DUPLICATE_REGISTERED'],
        timeout=1200,
        label=f'near-miss id={near_miss["id"]}',
    )

    final_state = latest_state(near_miss['id'])

    if final_state in ('ARCHIVED', 'STAGED'):
        logger.info('')
        logger.info('SUCCESS: near-miss completed integration (NOT flagged as duplicate).')
        logger.info(f'  original:  id={original["id"]}  name={original["name"]}')
        logger.info(f'  near-miss: id={near_miss["id"]}  name={dup_name}')
        logger.info(
            '  A NOT_DUPLICATE dataset_duplication record should exist. '
            'Check the API or the near-miss dataset detail page.'
        )
    elif final_state == 'DUPLICATE_REGISTERED':
        logger.error(
            'UNEXPECTED: near-miss was flagged as a duplicate. '
            'Check the Jaccard threshold in the feature config '
            '(enabled_features.duplicate_detection.jaccard_threshold).'
        )
    else:
        logger.warning(f'Unexpected final state: {final_state}')


if __name__ == '__main__':
    setup_logging()
    run()

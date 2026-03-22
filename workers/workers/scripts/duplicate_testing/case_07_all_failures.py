"""
Case 07 — All three difference checks fail simultaneously.

Scenario
--------
The incoming dataset differs from the original in all three ways that the
comparison report can surface:

  - One file exists only in the incoming dataset (not in the original).
  - One file exists only in the original dataset (not in the incoming).
  - One file appears in both datasets under the same filename but with
    different content (different MD5 — counted as SAME_PATH_DIFFERENT_CONTENT).

25 additional files are shared between both datasets (same filename, same
content) to keep the Jaccard score above the detection threshold.

  original:  file_01–file_25 (shared) + file_mod_01.dat (v1) + file_original_01.dat  → 27
  incoming:  file_01–file_25 (shared) + file_mod_01.dat (v2) + file_incoming_01.dat  → 27
  identical (same path AND same MD5):  25  (only the shared files)
  Jaccard = 25 / (27 + 27 - 25) = 25/29 ≈ 0.862  (above 0.85 threshold)

Expected comparison report:
  Exact content matches (EXACT_CONTENT_MATCHES):   25  (file_01–file_25)  → summary
  Same path + different content (SAME_PATH_DIFFERENT_CONTENT): 1 (file_mod_01.dat)  → FAILED
  Only in incoming (ONLY_IN_INCOMING): 1  (file_incoming_01.dat)  → FAILED
  Only in original (ONLY_IN_ORIGINAL): 1  (file_original_01.dat)  → FAILED

This is the primary test case for verifying all three failure states in the
comparison report UI simultaneously.

Expected state transitions
--------------------------
  original:  REGISTERED → READY → INSPECTED → ARCHIVED → STAGED
  duplicate: REGISTERED → READY → INSPECTED → DUPLICATE_REGISTERED → DUPLICATE_READY

Naming convention
-----------------
  original dir:  dup-test--case-07--<timestamp>  (unique-checked)
  duplicate dir: <original_name>--copy-id<original_id>_DUPLICATE_1  (unique-checked)

Usage (inside celery_worker container)
---------------------------------------
    python -m workers.scripts.duplicate_testing.case_07_all_failures
"""

import logging

from workers.scripts.duplicate_testing._common import (
    BASE_DIR,
    duplicate_name_and_dir,
    find_unique_name,
    jaccard_note,
    latest_state,
    make_dataset_dir,
    make_dataset_dir_mixed,
    register_and_start,
    run_tag,
    setup_logging,
    wait_for_state,
)

logger = logging.getLogger(__name__)

CASE = 'case-07-all-failures'

# 25 files shared between both datasets (same filename, same MD5).
SHARED_FILES = [f'file_{i:02d}.dat' for i in range(1, 26)]  # file_01–file_25

# One file present in both datasets but with different content.
MODIFIED_FILE = 'file_mod_01.dat'

# One file present only in the original (absent from incoming).
ORIGINAL_ONLY_FILE = 'file_original_01.dat'

# One file present only in the incoming (absent from original).
INCOMING_ONLY_FILE = 'file_incoming_01.dat'

# Totals:
#   original = 25 (shared) + 1 (modified v1) + 1 (original-only) = 27
#   incoming = 25 (shared) + 1 (modified v2) + 1 (incoming-only) = 27
#   identical (same path AND same MD5)            = 25
#   Jaccard = 25 / (27 + 27 - 25) = 25/29 ≈ 0.862  (above 0.85)
_TOTAL_ORIGINAL = len(SHARED_FILES) + 2   # 27
_TOTAL_INCOMING = len(SHARED_FILES) + 2   # 27
_COMMON = len(SHARED_FILES)               # 25


def run() -> None:
    tag = run_tag()
    original_name = find_unique_name(f'dup-test--{CASE}--{tag}')

    jaccard_str = jaccard_note(_TOTAL_INCOMING, _TOTAL_ORIGINAL, _COMMON)
    logger.info('=' * 70)
    logger.info('Case 07: all three difference checks fail (Jaccard ≈ 0.862)')
    logger.info(f'  original name:  {original_name}')
    logger.info(f'  original files: 25 shared + 1 modified (v1) + 1 original-only = {_TOTAL_ORIGINAL} total')
    logger.info(f'  incoming files: 25 shared + 1 modified (v2) + 1 incoming-only = {_TOTAL_INCOMING} total')
    logger.info(f'  Jaccard:        {jaccard_str}  (threshold 0.85 → WILL be registered)')
    logger.info('=' * 70)
    logger.info('Total estimated time: ~3-5 min (with recency_threshold_seconds=60).')

    # Step 1 — Create and register the original.
    logger.info('')
    logger.info('Step 1: creating and registering the original dataset...')
    original_dir = BASE_DIR / original_name
    # Original has the shared files, file_mod_01.dat (v1), and file_original_01.dat.
    make_dataset_dir_mixed(
        original_dir,
        SHARED_FILES + [ORIGINAL_ONLY_FILE],
        {MODIFIED_FILE: 1},
    )
    original = register_and_start(original_name, original_dir)

    # Step 2 — Wait for the original to be INSPECTED.
    logger.info('')
    logger.info('Step 2: waiting for original to reach INSPECTED (~1-2 min)...')
    reached = wait_for_state(
        dataset_id=original['id'],
        target_states=['INSPECTED', 'ARCHIVED', 'STAGED'],
        label=f'original id={original["id"]}',
    )
    if not reached:
        logger.error('Original did not reach INSPECTED within timeout.')
        return

    # Step 3 — Create and register the duplicate.
    dup_name, dup_dir = duplicate_name_and_dir(original)
    logger.info('')
    logger.info('Step 3: original is INSPECTED — creating and registering the duplicate...')
    logger.info(f'  duplicate dir: {dup_dir.name}')
    # Duplicate has the shared files, file_mod_01.dat (v2, different MD5), and
    # file_incoming_01.dat.  file_original_01.dat is absent.
    make_dataset_dir_mixed(
        dup_dir,
        SHARED_FILES + [INCOMING_ONLY_FILE],
        {MODIFIED_FILE: 2},
    )
    duplicate = register_and_start(dup_name, dup_dir)

    # Step 4 — Wait for the duplicate to be detected.
    logger.info('')
    logger.info('Step 4: waiting for duplicate to reach DUPLICATE_REGISTERED (~1-2 min)...')
    reached = wait_for_state(
        dataset_id=duplicate['id'],
        target_states=['DUPLICATE_REGISTERED', 'DUPLICATE_READY', 'ARCHIVED', 'STAGED'],
        label=f'duplicate id={duplicate["id"]}',
    )

    if not reached:
        logger.error('FAIL: duplicate did not reach any expected state within timeout.')
        return

    final_state = latest_state(duplicate['id'])

    if final_state in ('DUPLICATE_REGISTERED', 'DUPLICATE_READY'):
        logger.info('')
        logger.info('SUCCESS: all-failures duplicate detected and registered.')
        logger.info(f'  original:  id={original["id"]}  name={original["name"]}')
        logger.info(f'  duplicate: id={duplicate["id"]}  name={dup_name}')
        logger.info(f'  Jaccard:   {jaccard_str}')
        logger.info('  Expected comparison report:')
        logger.info(f'    Matching files:        {_COMMON}  (file_01–file_25)')
        logger.info(f'    Modified files:          1  (file_mod_01.dat)  ← FAILED')
        logger.info(f'    Only in incoming:        1  (file_incoming_01.dat)  ← FAILED')
        logger.info(f'    Only in original:        1  (file_original_01.dat)  ← FAILED')
        logger.info('  Open the UI and navigate to the duplicate dataset to view the report.')
    elif final_state in ('ARCHIVED', 'STAGED'):
        logger.warning(
            'The dataset was NOT detected as a duplicate (reached ARCHIVED/STAGED). '
            f'Jaccard {jaccard_str} is unexpectedly below the configured threshold. '
            'Check enabled_features.duplicate_detection.jaccard_threshold in the API config.'
        )
    else:
        logger.warning(f'Unexpected final state: {final_state}')


if __name__ == '__main__':
    setup_logging()
    run()

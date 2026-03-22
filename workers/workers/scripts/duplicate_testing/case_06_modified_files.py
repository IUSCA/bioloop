"""
Case 06 — Modified files: SAME_PATH_DIFFERENT_CONTENT check fails.

Scenario
--------
The incoming dataset shares 18 files with the original (same filename, same
content), plus one additional file that exists in BOTH datasets under the same
filename but with different content (different MD5).  The Jaccard score counts
only content-identical files, so this modified file does NOT count towards the
identical set.

  original:  file_01–file_18 (shared, v1 content) + file_mod_01.dat (v1)  → 19
  incoming:  file_01–file_18 (shared, v1 content) + file_mod_01.dat (v2)  → 19
  common paths (same name):  all 19 — but only 18 are content-identical
  Jaccard = 18 / (19 + 19 - 18) = 18/20 = 0.90  (above 0.85 threshold)

Expected comparison report:
  Exact content matches (EXACT_CONTENT_MATCHES): 18  (file_01–file_18)  → summary
  Same path + different content (SAME_PATH_DIFFERENT_CONTENT): 1 (file_mod_01.dat) → FAILED
  Only in incoming (ONLY_IN_INCOMING): 0                     → passed
  Only in original (ONLY_IN_ORIGINAL): 0                     → passed

This case specifically exercises the SAME_PATH_DIFFERENT_CONTENT failure path.

Expected state transitions
--------------------------
  original:  REGISTERED → READY → INSPECTED → ARCHIVED → STAGED
  duplicate: REGISTERED → READY → INSPECTED → DUPLICATE_REGISTERED → DUPLICATE_READY

Naming convention
-----------------
  original dir:  dup-test--case-06--<timestamp>  (unique-checked)
  duplicate dir: <original_name>--copy-id<original_id>_DUPLICATE_1  (unique-checked)

Usage (inside celery_worker container)
---------------------------------------
    python -m workers.scripts.duplicate_testing.case_06_modified_files
"""

import logging

from workers.scripts.duplicate_testing._common import (
    BASE_DIR,
    duplicate_name_and_dir,
    find_unique_name,
    jaccard_note,
    latest_state,
    make_dataset_dir_mixed,
    register_and_start,
    run_tag,
    setup_logging,
    wait_for_state,
)

logger = logging.getLogger(__name__)

CASE = 'case-06-modified-files'

# 18 files that exist in both datasets with identical content.
SHARED_FILES = [f'file_{i:02d}.dat' for i in range(1, 19)]  # file_01–file_18

# One file present in both datasets but with different content (different MD5).
MODIFIED_FILE = 'file_mod_01.dat'

# Totals: original = 18 + 1 = 19,  incoming = 18 + 1 = 19,  identical = 18
# Jaccard = 18 / (19 + 19 - 18) = 18/20 = 0.90  (above default threshold 0.85)
_TOTAL_ORIGINAL = len(SHARED_FILES) + 1   # 19
_TOTAL_INCOMING = len(SHARED_FILES) + 1   # 19
_COMMON = len(SHARED_FILES)               # 18  (only content-identical files count)


def run() -> None:
    tag = run_tag()
    original_name = find_unique_name(f'dup-test--{CASE}--{tag}')

    jaccard_str = jaccard_note(_TOTAL_INCOMING, _TOTAL_ORIGINAL, _COMMON)
    logger.info('=' * 70)
    logger.info('Case 06: modified files (Jaccard 0.90 — SAME_PATH_DIFFERENT_CONTENT fails)')
    logger.info(f'  original name:  {original_name}')
    logger.info(f'  original files: {len(SHARED_FILES)} shared + 1 modified (v1) = {_TOTAL_ORIGINAL} total')
    logger.info(f'  incoming files: {len(SHARED_FILES)} shared + 1 modified (v2) = {_TOTAL_INCOMING} total')
    logger.info(f'  Jaccard:        {jaccard_str}  (threshold 0.85 → WILL be registered)')
    logger.info('=' * 70)
    logger.info('Total estimated time: ~3-5 min (with recency_threshold_seconds=60).')

    # Step 1 — Create and register the original.
    logger.info('')
    logger.info('Step 1: creating and registering the original dataset...')
    original_dir = BASE_DIR / original_name
    # Original has file_mod_01.dat with version 1 content.
    make_dataset_dir_mixed(original_dir, SHARED_FILES, {MODIFIED_FILE: 1})
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

    # Step 3 — Create and register the duplicate with a modified version of the file.
    dup_name, dup_dir = duplicate_name_and_dir(original)
    logger.info('')
    logger.info('Step 3: original is INSPECTED — creating and registering the duplicate...')
    logger.info(f'  duplicate dir: {dup_dir.name}')
    # Duplicate has file_mod_01.dat with version 2 — different MD5 than original.
    make_dataset_dir_mixed(dup_dir, SHARED_FILES, {MODIFIED_FILE: 2})
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
        logger.info('SUCCESS: modified-files duplicate detected and registered.')
        logger.info(f'  original:  id={original["id"]}  name={original["name"]}')
        logger.info(f'  duplicate: id={duplicate["id"]}  name={dup_name}')
        logger.info(f'  Jaccard:   {jaccard_str}')
        logger.info('  Expected comparison report:')
        logger.info(f'    Matching files:       {_COMMON}  (file_01–file_18)')
        logger.info(f'    Modified files:        1  (file_mod_01.dat)  ← FAILED')
        logger.info(f'    Only in incoming:      0')
        logger.info(f'    Only in original:      0')
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

"""
Case 05 — Partial match: Jaccard score above threshold but not 100%.

Scenario
--------
The incoming dataset shares 18 out of 19 files with the original.  One file
exists only in the incoming dataset, and one file exists only in the original.
The Jaccard score is 18/20 = 0.90, which is above the default threshold of 0.85.

The duplicate IS registered (DUPLICATE_REGISTERED), and the comparison report
shows all three difference categories alongside the 18 matching files:
  - Exact content matches (EXACT_CONTENT_MATCHES): 18  (file_01–file_18 appear in both)
  - Same path + different content (SAME_PATH_DIFFERENT_CONTENT): 0
  - Only in incoming (ONLY_IN_INCOMING): 1  (file_incoming_01.dat)
  - Only in original (ONLY_IN_ORIGINAL): 1  (file_original_01.dat)

This is the primary test case for verifying the comparison report UI with a
rich, non-trivial diff — the only case other than 01/02/04 that produces a
viewable duplication report under the default 0.85 threshold.

Expected outcome
----------------
  original:  REGISTERED → READY → INSPECTED → ARCHIVED → STAGED
  duplicate: REGISTERED → READY → INSPECTED → DUPLICATE_REGISTERED → DUPLICATE_READY

File overlap
------------
  original:  file_01–file_18 (18 shared), file_original_01.dat  → 19 total
  incoming:  file_01–file_18 (18 shared), file_incoming_01.dat  → 19 total
  Jaccard:   18 / (19 + 19 - 18) = 18/20 = 0.90  (above 0.85 threshold)

Compare case 03 (near-miss): Jaccard 0.27, below threshold → NOT_DUPLICATE record,
no DUPLICATE_REGISTERED state, no viewable comparison report.

Naming convention
-----------------
  original dir and API name: dup-test--case-05--<timestamp>  (unique-checked)
  duplicate dir and API name: <original_name>--copy-id<original_id>_DUPLICATE_1
                               (unique-checked; _DUPLICATE_ token required by
                                the inspect task's near-miss recording logic)

Usage (inside celery_worker container)
---------------------------------------
    python -m workers.scripts.duplicate_testing.case_05_partial_match
"""

import logging

from workers.scripts.duplicate_testing._common import (
    BASE_DIR,
    duplicate_name_and_dir,
    find_unique_name,
    latest_state,
    make_dataset_dir,
    register_and_start,
    run_tag,
    setup_logging,
    wait_for_state,
    jaccard_note,
)

logger = logging.getLogger(__name__)

CASE = 'case-05-partial-match'

# Shared files appear in both datasets with identical content (same MD5).
# Using zero-padded numeric names keeps the listing ordered and unambiguous.
SHARED_FILES = [f'file_{i:02d}.dat' for i in range(1, 19)]  # 18 files: file_01–file_18

# One file that exists only in the original (removed in the incoming dataset).
ORIGINAL_ONLY_FILES = ['file_original_01.dat']  # 1 file

# One file that exists only in the incoming dataset (new addition).
INCOMING_ONLY_FILES = ['file_incoming_01.dat']  # 1 file

# Totals:  original = 18+1 = 19, incoming = 18+1 = 19, common = 18
# Jaccard = 18 / (19 + 19 - 18) = 18/20 = 0.90  (above default threshold 0.85)
_TOTAL_ORIGINAL = len(SHARED_FILES) + len(ORIGINAL_ONLY_FILES)   # 19
_TOTAL_INCOMING = len(SHARED_FILES) + len(INCOMING_ONLY_FILES)   # 19
_COMMON = len(SHARED_FILES)                                       # 18


def run() -> None:
    tag = run_tag()
    original_name = find_unique_name(f'dup-test--{CASE}--{tag}')

    jaccard_str = jaccard_note(_TOTAL_INCOMING, _TOTAL_ORIGINAL, _COMMON)
    logger.info('=' * 70)
    logger.info('Case 05: partial match (Jaccard 0.90 — above default 0.85 threshold)')
    logger.info(f'  original name:   {original_name}')
    logger.info(f'  original files:  {len(SHARED_FILES)} shared + {len(ORIGINAL_ONLY_FILES)} original-only'
                f' = {_TOTAL_ORIGINAL} total')
    logger.info(f'  incoming files:  {len(SHARED_FILES)} shared + {len(INCOMING_ONLY_FILES)} incoming-only'
                f' = {_TOTAL_INCOMING} total')
    logger.info(f'  Jaccard:         {jaccard_str}  (threshold 0.85 → WILL be registered)')
    logger.info('=' * 70)
    logger.info('Total estimated time: ~3-5 min (with recency_threshold_seconds=60).')

    # Step 1 — Create and register the original.
    logger.info('')
    logger.info('Step 1: creating and registering the original dataset...')
    original_dir = BASE_DIR / original_name
    make_dataset_dir(original_dir, SHARED_FILES + ORIGINAL_ONLY_FILES)
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

    # Step 3 — Derive a unique duplicate name that encodes the original's ID and
    # embeds the _DUPLICATE_ token (required by the inspect task's near-miss logic).
    dup_name, dup_dir = duplicate_name_and_dir(original)
    logger.info('')
    logger.info('Step 3: original is INSPECTED — creating and registering the partial duplicate...')
    logger.info(f'  duplicate dir:  {dup_dir.name}')
    make_dataset_dir(dup_dir, SHARED_FILES + INCOMING_ONLY_FILES)
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
        logger.info('SUCCESS: partial duplicate detected and registered.')
        logger.info(f'  original:  id={original["id"]}  name={original["name"]}')
        logger.info(f'  duplicate: id={duplicate["id"]}  name={dup_name}')
        logger.info(f'  Jaccard:   {jaccard_str}')
        logger.info('  Expected comparison report:')
        logger.info(f'    Matching files:       {_COMMON}  (file_01–file_18)')
        logger.info(f'    Modified files:        0')
        logger.info(f'    Only in incoming:      {len(INCOMING_ONLY_FILES)}  (file_incoming_01.dat)')
        logger.info(f'    Only in original:      {len(ORIGINAL_ONLY_FILES)}  (file_original_01.dat)')
        logger.info('  Open the UI and navigate to the duplicate dataset to view the report.')
    elif final_state in ('ARCHIVED', 'STAGED'):
        logger.warning(
            'The partial-match dataset was NOT detected as a duplicate (reached ARCHIVED/STAGED). '
            f'Jaccard {jaccard_str} is unexpectedly below the configured threshold. '
            'Check dataset_duplication.jaccard_threshold in the API config.'
        )
    else:
        logger.warning(f'Unexpected final state: {final_state}')


if __name__ == '__main__':
    setup_logging()
    run()

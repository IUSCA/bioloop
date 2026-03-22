"""
Case 02 — Duplicate registered AFTER original has been fully INSPECTED.

Scenario
--------
The original dataset is registered and the script waits for it to reach the
INSPECTED state (approximately 5–8 minutes in Docker).  Only then is the
duplicate dataset registered.

Because the original is already INSPECTED when the duplicate's inspect_dataset
task runs, wait_for_concurrent_inspections() returns immediately (no waiting).
Jaccard duplicate detection fires right after the duplicate's own inspection
finishes, finding the original with score = 1.0.

This is the clean-path case: no concurrency concerns, straightforward detection.

Expected outcome
----------------
  original:  REGISTERED → READY → INSPECTED → ARCHIVED → STAGED
  duplicate: REGISTERED → READY → INSPECTED → DUPLICATE_REGISTERED → DUPLICATE_READY

File overlap
------------
  original:  file_A, file_B, file_C, file_D, file_E  (5 files, 64 KB each)
  duplicate: file_A, file_B, file_C, file_D, file_E  (identical copies)
  Jaccard:   5 / (5 + 5 - 5) = 1.0  (100% match)

Naming convention
-----------------
  original dir and API name: dup-test--case-02--<timestamp>  (unique-checked)
  duplicate dir and API name: <original_name>--copy-id<original_id>_DUPLICATE_1
                               (unique-checked; _DUPLICATE_ token required by
                                the inspect task's near-miss recording logic)

Usage (inside celery_worker container)
---------------------------------------
    python -m workers.scripts.duplicate_testing.case_02_after_inspection
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
)

logger = logging.getLogger(__name__)

CASE = 'case-02-after-inspect'
SHARED_FILES = ['file_A.dat', 'file_B.dat', 'file_C.dat', 'file_D.dat', 'file_E.dat']


def run() -> None:
    tag = run_tag()
    original_name = find_unique_name(f'dup-test--{CASE}--{tag}')

    logger.info('=' * 70)
    logger.info('Case 02: duplicate registered AFTER original is INSPECTED')
    logger.info(f'  original name:  {original_name}')
    logger.info(f'  files:          {SHARED_FILES}')
    logger.info(f'  Jaccard:        {jaccard_note(5, 5, 5)}')
    logger.info('=' * 70)
    logger.info(
        'NOTE: await_stability takes ~5 min in Docker. '
        'Total estimated time: ~10-15 min (original inspection + duplicate inspection).'
    )

    # Step 1 — Create and register the original dataset.
    logger.info('')
    logger.info('Step 1: creating and registering the original dataset...')
    original_dir = BASE_DIR / original_name
    make_dataset_dir(original_dir, SHARED_FILES)
    original = register_and_start(original_name, original_dir)

    # Step 2 — Wait for the original to be fully INSPECTED.
    # The duplicate must not be registered until this point so that
    # wait_for_concurrent_inspections() on the duplicate side skips the wait.
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

    # Step 3 — Derive a unique duplicate name that encodes the original's ID and
    # embeds the _DUPLICATE_ token (required by the inspect task's near-miss logic).
    dup_name, dup_dir = duplicate_name_and_dir(original)
    logger.info('')
    logger.info('Step 3: original is INSPECTED — creating and registering the duplicate...')
    logger.info(f'  duplicate dir:  {dup_dir.name}')
    make_dataset_dir(dup_dir, SHARED_FILES)
    duplicate = register_and_start(dup_name, dup_dir)

    # Step 4 — Wait for the duplicate to be registered as a duplicate.
    logger.info('')
    logger.info('Step 4: waiting for duplicate to reach DUPLICATE_REGISTERED (~5-8 min)...')
    reached = wait_for_state(
        dataset_id=duplicate['id'],
        target_states=['DUPLICATE_REGISTERED', 'DUPLICATE_READY'],
        label=f'duplicate id={duplicate["id"]}',
    )

    if reached:
        logger.info('')
        logger.info('SUCCESS: duplicate detected and registered.')
        logger.info(f'  original:  id={original["id"]}  name={original["name"]}')
        logger.info(f'  duplicate: id={duplicate["id"]}  name={dup_name}')
        logger.info('  Open the UI and navigate to the duplicate dataset to accept or reject.')
    else:
        logger.error('FAIL: duplicate was not detected within the timeout.')
        logger.error('Check the celery_worker logs for errors in inspect_dataset.')


if __name__ == '__main__':
    setup_logging()
    run()

"""
Case 04 — Multiple duplicate datasets registered against the same original.

Scenario
--------
Two separate datasets (dup-1 and dup-2) are both exact copies of the same
original.  Each independently detects the original as its target during its
own inspection and calls register_duplicate().

This exercises the accept-side logic: when an operator accepts dup-1, the
API's reject_concurrent_active_duplicates() automatically soft-deletes dup-2
and transitions it to DUPLICATE_REJECTED.

Expected outcome
----------------
  original: REGISTERED → READY → INSPECTED → ARCHIVED → STAGED
  dup-1:    REGISTERED → READY → INSPECTED → DUPLICATE_REGISTERED → DUPLICATE_READY
  dup-2:    REGISTERED → READY → INSPECTED → DUPLICATE_REGISTERED → DUPLICATE_READY

  After an operator accepts dup-1 via the UI:
    dup-1   → (takes over original's name and continues integration)
    dup-2   → DUPLICATE_REJECTED  (auto-rejected by the accept transaction)
    original→ OVERWRITTEN         (soft-deleted)

File overlap
------------
  original: file_A, file_B, file_C, file_D, file_E  (5 files, 64 KB each)
  dup-1:    file_A, file_B, file_C, file_D, file_E  (identical → Jaccard 1.0)
  dup-2:    file_A, file_B, file_C, file_D, file_E  (identical → Jaccard 1.0)

Naming convention
-----------------
  original dir and API name: dup-test--case-04--<timestamp>  (unique-checked)
  dup-1 dir and API name:    <original_name>--copy-id<original_id>_DUPLICATE_1
                              (unique-checked; _DUPLICATE_ token required by
                               the inspect task's near-miss recording logic)
  dup-2 dir and API name:    <original_name>--copy-id<original_id>_DUPLICATE_2
                              (unique-checked)

Usage (inside celery_worker container)
---------------------------------------
    python -m workers.scripts.duplicate_testing.case_04_multiple_duplicates
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

CASE = 'case-04-multiple-dups'
SHARED_FILES = ['file_A.dat', 'file_B.dat', 'file_C.dat', 'file_D.dat', 'file_E.dat']


def _wait_duplicate_ready(dataset_id: int, label: str) -> bool:
    return wait_for_state(
        dataset_id=dataset_id,
        target_states=['DUPLICATE_REGISTERED', 'DUPLICATE_READY'],
        label=label,
    )


def run() -> None:
    tag = run_tag()
    original_name = find_unique_name(f'dup-test--{CASE}--{tag}')

    logger.info('=' * 70)
    logger.info('Case 04: multiple duplicates for the same original')
    logger.info(f'  original name:  {original_name}')
    logger.info(f'  files:          {SHARED_FILES}')
    logger.info(f'  Jaccard (each): {jaccard_note(5, 5, 5)}')
    logger.info('=' * 70)
    logger.info(
        'NOTE: Total estimated time: ~15-20 min. '
        'After both duplicates reach DUPLICATE_READY, accept one via the UI. '
        'The other should be auto-rejected by the accept transaction.'
    )

    # Step 1 — Create and register the original.
    logger.info('')
    logger.info('Step 1: creating and registering the original dataset...')
    original_dir = BASE_DIR / original_name
    make_dataset_dir(original_dir, SHARED_FILES)
    original = register_and_start(original_name, original_dir)

    # Step 2 — Wait for the original to be INSPECTED.
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

    # Step 3 — Register both duplicates with unique names that encode the original's
    # ID and embed the _DUPLICATE_ token.  The seq argument (1, 2) distinguishes
    # them on disk and in the database.
    dup1_name, dup1_dir = duplicate_name_and_dir(original, seq=1)
    dup2_name, dup2_dir = duplicate_name_and_dir(original, seq=2)

    logger.info('')
    logger.info('Step 3: registering both duplicates back-to-back...')
    logger.info(f'  dup-1 dir: {dup1_dir.name}')
    logger.info(f'  dup-2 dir: {dup2_dir.name}')
    make_dataset_dir(dup1_dir, SHARED_FILES)
    dup1 = register_and_start(dup1_name, dup1_dir)

    make_dataset_dir(dup2_dir, SHARED_FILES)
    dup2 = register_and_start(dup2_name, dup2_dir)

    # Step 4 — Wait for both duplicates to reach DUPLICATE_REGISTERED.
    logger.info('')
    logger.info('Step 4: waiting for dup-1 to reach DUPLICATE_REGISTERED (~5-8 min)...')
    dup1_ok = _wait_duplicate_ready(dup1['id'], f'dup-1 id={dup1["id"]}')

    logger.info('')
    logger.info('Step 5: waiting for dup-2 to reach DUPLICATE_REGISTERED (~5-8 min)...')
    dup2_ok = _wait_duplicate_ready(dup2['id'], f'dup-2 id={dup2["id"]}')

    if dup1_ok and dup2_ok:
        logger.info('')
        logger.info('SUCCESS: both duplicates detected and registered.')
        logger.info(f'  original: id={original["id"]}  name={original["name"]}')
        logger.info(f'  dup-1:    id={dup1["id"]}  name={dup1_name}')
        logger.info(f'  dup-2:    id={dup2["id"]}  name={dup2_name}')
        logger.info('')
        logger.info('Next step:')
        logger.info(
            '  Accept either dup-1 or dup-2 via the UI (/datasets/<id>/duplication). '
            'The other duplicate should be auto-rejected by the accept transaction '
            '(reject_concurrent_active_duplicates). '
            'The original should transition to OVERWRITTEN.'
        )
    else:
        if not dup1_ok:
            logger.error('FAIL: dup-1 was not detected within timeout.')
        if not dup2_ok:
            logger.error('FAIL: dup-2 was not detected within timeout.')
        logger.error('Check the celery_worker logs for errors in inspect_dataset.')


if __name__ == '__main__':
    setup_logging()
    run()

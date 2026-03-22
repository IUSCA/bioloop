"""
Case 09 — Same path + same content baseline (perfect overlap).

Purpose
-------
Provides a focused, deterministic scenario for the new UI check buckets where:
  - EXACT_CONTENT_MATCHES has a non-zero count
  - SAME_PATH_SAME_CONTENT has a non-zero count
  - all difference buckets are zero

This is intentionally a "clean" baseline case for validating the report body's
summary rows and zero-count behavior in the UI.

Expected report highlights
--------------------------
  EXACT_CONTENT_MATCHES: 12
  SAME_PATH_SAME_CONTENT: 12
  SAME_PATH_DIFFERENT_CONTENT: 0
  SAME_CONTENT_DIFFERENT_PATH: 0
  ONLY_IN_INCOMING: 0
  ONLY_IN_ORIGINAL: 0

Jaccard
-------
  incoming total = 12
  original total = 12
  exact-content matches = 12
  Jaccard = 12 / (12 + 12 - 12) = 1.0

Usage (inside celery_worker container)
--------------------------------------
  python -m workers.scripts.duplicate_testing.case_09_same_path_same_content
"""

import logging

from workers.scripts.duplicate_testing._common import (
    BASE_DIR,
    duplicate_name_and_dir,
    find_unique_name,
    jaccard_note,
    latest_state,
    make_dataset_dir,
    register_and_start,
    run_tag,
    setup_logging,
    wait_for_state,
)

logger = logging.getLogger(__name__)

CASE = 'case-09-same-path-same-content'
FILES = [f'file_{i:02d}.dat' for i in range(1, 13)]  # 12 files


def run() -> None:
    tag = run_tag()
    original_name = find_unique_name(f'dup-test--{CASE}--{tag}')
    jaccard_str = jaccard_note(len(FILES), len(FILES), len(FILES))

    logger.info('=' * 70)
    logger.info('Case 09: same path + same content baseline')
    logger.info(f'  original name: {original_name}')
    logger.info(f'  files:         {len(FILES)} shared (perfect overlap)')
    logger.info(f'  Jaccard:       {jaccard_str} (threshold 0.85 -> WILL be registered)')
    logger.info('=' * 70)

    original_dir = BASE_DIR / original_name
    make_dataset_dir(original_dir, FILES)
    original = register_and_start(original_name, original_dir)

    reached = wait_for_state(
        dataset_id=original['id'],
        target_states=['INSPECTED', 'ARCHIVED', 'STAGED'],
        label=f'original id={original["id"]}',
    )
    if not reached:
        logger.error('Original did not reach INSPECTED within timeout.')
        return

    dup_name, dup_dir = duplicate_name_and_dir(original)
    make_dataset_dir(dup_dir, FILES)
    duplicate = register_and_start(dup_name, dup_dir)

    reached = wait_for_state(
        dataset_id=duplicate['id'],
        target_states=['DUPLICATE_REGISTERED', 'DUPLICATE_READY', 'ARCHIVED', 'STAGED'],
        label=f'duplicate id={duplicate["id"]}',
    )
    if not reached:
        logger.error('FAIL: duplicate did not reach expected states within timeout.')
        return

    final_state = latest_state(duplicate['id'])
    if final_state in ('DUPLICATE_REGISTERED', 'DUPLICATE_READY'):
        logger.info('SUCCESS: baseline duplicate registered.')
        logger.info('Expected report highlights:')
        logger.info(f'  EXACT_CONTENT_MATCHES:         {len(FILES)}')
        logger.info(f'  SAME_PATH_SAME_CONTENT:        {len(FILES)}')
        logger.info('  SAME_PATH_DIFFERENT_CONTENT:   0')
        logger.info('  SAME_CONTENT_DIFFERENT_PATH:   0')
        logger.info('  ONLY_IN_INCOMING:              0')
        logger.info('  ONLY_IN_ORIGINAL:              0')
    else:
        logger.warning(f'Unexpected final state: {final_state}')


if __name__ == '__main__':
    setup_logging()
    run()

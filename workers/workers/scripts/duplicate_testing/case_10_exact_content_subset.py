"""
Case 10 — Exact-content summary exceeds same-path summary.

Purpose
-------
Creates a deterministic scenario where one file has identical content in both
datasets but appears under different paths. This verifies the new hash-first UI
model where:
  - EXACT_CONTENT_MATCHES includes both same-path and moved/renamed matches
  - SAME_PATH_SAME_CONTENT is the stricter subset

Expected report highlights
--------------------------
  EXACT_CONTENT_MATCHES: 11
  SAME_PATH_SAME_CONTENT: 10
  SAME_CONTENT_DIFFERENT_PATH: 1 (failed)
  SAME_PATH_DIFFERENT_CONTENT: 0
  ONLY_IN_INCOMING: 0
  ONLY_IN_ORIGINAL: 0

Jaccard
-------
  incoming total = 11
  original total = 11
  exact-content matches = 11
  Jaccard = 11 / (11 + 11 - 11) = 1.0

Usage (inside celery_worker container)
--------------------------------------
  python -m workers.scripts.duplicate_testing.case_10_exact_content_subset
"""

import logging

from workers.scripts.duplicate_testing._common import (
    BASE_DIR,
    duplicate_name_and_dir,
    find_unique_name,
    jaccard_note,
    latest_state,
    make_dataset_dir_with_content_keys,
    register_and_start,
    run_tag,
    setup_logging,
    wait_for_state,
)

logger = logging.getLogger(__name__)

CASE = 'case-10-exact-content-subset'


def run() -> None:
    tag = run_tag()
    original_name = find_unique_name(f'dup-test--{CASE}--{tag}')

    shared_specs = [(f'file_{i:02d}.dat', f'shared-{i:02d}') for i in range(1, 11)]  # 10
    original_moved = ('folder-a/moved_source.dat', 'moved-content-key')
    incoming_moved = ('folder-b/moved_target.dat', 'moved-content-key')

    original_specs = shared_specs + [original_moved]
    incoming_specs = shared_specs + [incoming_moved]

    total_incoming = len(incoming_specs)
    total_original = len(original_specs)
    exact_matches = len(shared_specs) + 1
    jaccard_str = jaccard_note(total_incoming, total_original, exact_matches)

    logger.info('=' * 70)
    logger.info('Case 10: exact-content superset over same-path subset')
    logger.info(f'  original name: {original_name}')
    logger.info(f'  Jaccard:       {jaccard_str} (threshold 0.85 -> WILL be registered)')
    logger.info('=' * 70)

    original_dir = BASE_DIR / original_name
    make_dataset_dir_with_content_keys(original_dir, original_specs)
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
    make_dataset_dir_with_content_keys(dup_dir, incoming_specs)
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
        logger.info('SUCCESS: duplicate registered for exact-content subset scenario.')
        logger.info('Expected report highlights:')
        logger.info(f'  EXACT_CONTENT_MATCHES:         {exact_matches}')
        logger.info(f'  SAME_PATH_SAME_CONTENT:        {len(shared_specs)}')
        logger.info('  SAME_CONTENT_DIFFERENT_PATH:   1  (failed)')
        logger.info('  SAME_PATH_DIFFERENT_CONTENT:   0')
        logger.info('  ONLY_IN_INCOMING:              0')
        logger.info('  ONLY_IN_ORIGINAL:              0')
    else:
        logger.warning(f'Unexpected final state: {final_state}')


if __name__ == '__main__':
    setup_logging()
    run()

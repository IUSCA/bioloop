"""
Case 08 — Same content, different path/name.

Scenario
--------
Incoming and original datasets share the same content for one file (same MD5),
but under different paths. This must be classified as:
  - SAME_CONTENT_DIFFERENT_PATH = failed (count 1)
and must NOT be reported as only-in-incoming + only-in-original.

We keep Jaccard above threshold with additional exact matches:
  incoming total = 20
  original total = 20
  exact-content matches = 19
  Jaccard = 19 / (20 + 20 - 19) = 19/21 ≈ 0.905
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

CASE = 'case-08-same-content-different-path'


def run() -> None:
    tag = run_tag()
    original_name = find_unique_name(f'dup-test--{CASE}--{tag}')

    # 18 shared exact path+content files.
    shared_specs = [(f'file_{i:02d}.dat', f'shared-{i:02d}') for i in range(1, 19)]
    # One file with identical content but different path between original and incoming.
    original_renamed = ('folder-a/renamed_original.dat', 'renamed-content-key')
    incoming_renamed = ('folder-b/renamed_incoming.dat', 'renamed-content-key')
    # One more shared file to keep exact content matches high and Jaccard > threshold.
    extra_shared = [('anchor_shared.dat', 'anchor-shared-content')]

    original_specs = shared_specs + extra_shared + [original_renamed]
    incoming_specs = shared_specs + extra_shared + [incoming_renamed]

    total_incoming = len(incoming_specs)  # 20
    total_original = len(original_specs)  # 20
    exact_matches = len(shared_specs) + len(extra_shared) + 1  # 19
    jaccard_str = jaccard_note(total_incoming, total_original, exact_matches)

    logger.info('=' * 70)
    logger.info('Case 08: same-content different-path classification')
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
        logger.info('SUCCESS: duplicate registered with same-content-different-path scenario.')
        logger.info('Expected report highlights:')
        logger.info('  SAME_CONTENT_DIFFERENT_PATH: 1 (failed)')
        logger.info('  ONLY_IN_INCOMING: 0')
        logger.info('  ONLY_IN_ORIGINAL: 0')
    else:
        logger.warning(f'Unexpected final state: {final_state}')


if __name__ == '__main__':
    setup_logging()
    run()

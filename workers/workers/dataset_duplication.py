"""
Duplicate-detection helpers used after dataset inspection.

This module holds logic that was previously embedded in inspect_dataset: waiting
for concurrent inspections before comparing file sets, calling the duplication
candidate API, registering duplicates or near-misses, and enqueueing the
compare_duplicate_datasets task.
"""

import datetime
import os
import time
import uuid

from celery.utils.log import get_task_logger

import workers.api as api
from workers import exceptions as exc
from workers.config import config

logger = get_task_logger(__name__)


def _is_actively_inspecting(dataset: dict, current_dataset_id: int, current_created_at: str, timeout: int) -> bool:
    """
    Returns True if the given dataset is likely mid-inspection and should be
    waited on before running duplicate detection for the current dataset.

    A dataset is considered actively inspecting when ALL of the following hold:
      1. It is not the current dataset.
      2. It was created before the current dataset (by ISO timestamp comparison).
      3. It has not yet reached the INSPECTED state.
      4. It was created within the concurrent-inspection wait-timeout window.

    Condition 4 is what distinguishes an in-flight dataset from one that is
    simply stuck or was seeded directly into the database in a non-terminal
    state.

    In Docker (APP_ENV=docker) the database is seeded with synthetic datasets
    in REGISTERED state that will never be processed by watch.py.  Without
    condition 4, duplicate detection would block for the full timeout (default
    7200 s) on every inspection because those seed records appear as
    "not yet INSPECTED" forever.  The timeout window acts as a recency gate:
    anything registered more than `timeout` seconds ago and still not inspected
    is stale and should not block the current run.

    This recency gate is also correct in production: a dataset that has been
    REGISTERED for longer than the wait-timeout without reaching INSPECTED is
    either failed or stuck, and waiting for it would be counterproductive.
    """
    if dataset['id'] == current_dataset_id:
        return False
    if dataset.get('created_at') is None:
        return False
    if any(s['state'] == 'INSPECTED' for s in (dataset.get('states') or [])):
        return False

    created_at_str = str(dataset['created_at'])
    if created_at_str >= current_created_at:
        return False

    # In Docker mode the seed data contains datasets in REGISTERED state that
    # were never registered via watch.py and will never be inspected.  Guard
    # against blocking on them by applying the recency window regardless of
    # environment — it is always the correct behaviour (see docstring above).
    cutoff = (
        datetime.datetime.fromisoformat(current_created_at.replace('Z', '+00:00'))
        - datetime.timedelta(seconds=timeout)
    ).isoformat()

    if os.environ.get('APP_ENV') == 'docker':
        # In Docker, enforce the recency cutoff strictly: seed records predate
        # the cutoff and are therefore excluded.
        return created_at_str >= cutoff

    # In non-Docker environments apply the same recency window — any dataset
    # stuck in REGISTERED for longer than the timeout is not actively inspecting.
    return created_at_str >= cutoff


def wait_for_concurrent_inspections(dataset_id: int, dataset_type: str, created_at: str) -> None:
    """
    Waits for datasets of the same type that were created before this one
    and are actively mid-inspection to reach INSPECTED or a terminal state
    before running Jaccard duplicate detection.

    This prevents the comparison from running against a partially populated
    file set, which would produce an artificially low Jaccard score and miss
    a genuine duplicate.

    Uses _is_actively_inspecting() to exclude datasets that are stale or
    seeded directly into the DB (see that function's docstring for details).
    """
    timeout = config['enabled_features']['duplicate_detection']['concurrent_inspection_wait_timeout_seconds']
    poll_interval = 30
    elapsed = 0

    while elapsed < timeout:
        candidates = api.get_all_datasets(dataset_type=dataset_type, deleted=False)
        waiting_on = [
            d for d in candidates
            if _is_actively_inspecting(d, dataset_id, created_at, timeout)
        ]

        if not waiting_on:
            return

        names = [d['name'] for d in waiting_on]
        logger.info(
            f'inspect_dataset[{dataset_id}]: waiting for concurrent inspections to finish '
            f'before running duplicate detection. Waiting on: {names}. '
            f'Elapsed: {elapsed}s / {timeout}s'
        )
        time.sleep(poll_interval)
        elapsed += poll_interval

    logger.warning(
        f'inspect_dataset[{dataset_id}]: concurrent inspection wait timed out after {timeout}s. '
        f'Proceeding with duplicate detection against currently INSPECTED datasets.'
    )


def run_duplicate_detection(celery_task, dataset_id: int, dataset: dict) -> None:
    """
    Runs content-similarity duplicate detection (Jaccard index on MD5 overlap)
    after file metadata has been written.  If a duplicate is detected (score >= threshold):
      1. Pre-generates a Celery task ID for the comparison task.
      2. Registers the duplication via the API.
      3. Fires the comparison task with the pre-assigned ID.
      4. Raises DuplicateDetected to abort the integrated workflow.

    If the similarity score is below the threshold but the dataset was renamed
    with _DUPLICATE_ (indicating a prior name conflict), records the near-miss
    for UI visibility.
    """
    dup_config = config['enabled_features']['duplicate_detection']
    threshold = dup_config['jaccard_threshold']

    # Wait for any earlier same-type datasets still being inspected
    wait_for_concurrent_inspections(
        dataset_id=dataset_id,
        dataset_type=dataset['type'],
        created_at=str(dataset.get('created_at', '')),
    )

    # Ask the API for the best duplicate candidate
    result = api.get_duplication_candidate(dataset_id)
    candidate = result.get('candidate')

    if candidate is None:
        logger.info(f'inspect_dataset[{dataset_id}]: no duplicate candidate found (no common files).')
        return

    similarity = float(
        candidate.get('content_similarity_score', candidate.get('jaccard_score', 0)),
    )
    original_id = candidate['dataset']['id']
    logger.info(
        f'inspect_dataset[{dataset_id}]: best candidate is dataset {original_id} '
        f'with content similarity score {similarity:.4f} (threshold {threshold})'
    )

    if similarity >= threshold:
        # Pre-assign the comparison task ID so it can be stored in the duplication record
        comparison_task_id = str(uuid.uuid4())

        logger.info(
            f'inspect_dataset[{dataset_id}]: duplicate detected (score {similarity:.4f} >= {threshold}). '
            f'Registering duplication and firing comparison task {comparison_task_id}.'
        )

        api.register_duplicate(
            dataset_id=dataset_id,
            original_dataset_id=original_id,
            comparison_process_id=comparison_task_id,
            comparison_status='PENDING',
        )

        # Fire the comparison task with the pre-assigned ID
        from workers.tasks.declarations import compare_duplicate_datasets  # noqa: PLC0415
        compare_duplicate_datasets.apply_async(
            args=[dataset_id, original_id],
            task_id=comparison_task_id,
        )

        raise exc.DuplicateDetected(
            f'Dataset {dataset_id} is a duplicate of dataset {original_id} '
            f'(content similarity score {similarity:.4f}). Aborting integrated workflow.'
        )

    # Below threshold — dataset is not flagged as a duplicate.
    # If the name contains _DUPLICATE_, record the near-miss so the UI can
    # display an informational alert about the similarity score.
    dataset_name = dataset.get('name', '')
    if '_DUPLICATE_' in dataset_name:
        logger.info(
            f'inspect_dataset[{dataset_id}]: similarity score {similarity:.4f} is below '
            f'threshold {threshold}. Recording near-miss against dataset {original_id}.'
        )
        api.register_duplicate(
            dataset_id=dataset_id,
            original_dataset_id=original_id,
            comparison_process_id=None,
            comparison_status='NOT_DUPLICATE',
        )

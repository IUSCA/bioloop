import datetime
import os
import time
import uuid
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm.progress import Progress

import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
from workers import exceptions as exc
from workers.config import config
from workers.exceptions import InspectionFailed

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def generate_metadata(celery_task, source: Path):
    """
    source is a directory that exists and must be readable and executable.
    Returns: num_files, num_directories, size, num_genome_files, metadata
    """
    num_files, num_directories, size, num_genome_files = 0, 0, 0, 0
    metadata = []
    errors = []
    if not utils.is_readable(source):
        msg = f'source {source} is either not readable or not traversable'
        raise exc.InspectionFailed(msg)

    paths = list(source.rglob('*'))
    progress = Progress(celery_task=celery_task, name='', units='items')

    for p in progress(paths):
        if utils.is_readable(p):
            if p.is_file():
                num_files += 1
                file_size = p.lstat().st_size
                size += file_size
                hex_digest = utils.checksum(p) if not p.is_symlink() else None
                relpath = p.relative_to(source)
                metadata.append({
                    'path': str(relpath),
                    'md5': hex_digest,
                    'size': file_size,
                    'type': utils.filetype(p)
                })
                if ''.join(p.suffixes) in config['genome_file_types'] and not p.is_symlink():
                    num_genome_files += 1
            elif p.is_dir():
                num_directories += 1
        else:
            errors.append(f'{p} is not readable/traversable')

    if len(errors) > 0:
        raise exc.InspectionFailed(errors)

    return num_files, num_directories, size, num_genome_files, metadata


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
    Runs Jaccard-based duplicate detection after file metadata has been
    written.  If a duplicate is detected (jaccard >= threshold):
      1. Pre-generates a Celery task ID for the comparison task.
      2. Registers the duplication via the API.
      3. Fires the comparison task with the pre-assigned ID.
      4. Raises DuplicateDetected to abort the integrated workflow.

    If the jaccard score is below the threshold but the dataset was renamed
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

    jaccard = candidate['jaccard_score']
    original_id = candidate['dataset']['id']
    logger.info(
        f'inspect_dataset[{dataset_id}]: best candidate is dataset {original_id} '
        f'with Jaccard score {jaccard:.4f} (threshold {threshold})'
    )

    if jaccard >= threshold:
        # Pre-assign the comparison task ID so it can be stored in the duplication record
        comparison_task_id = str(uuid.uuid4())

        logger.info(
            f'inspect_dataset[{dataset_id}]: duplicate detected (jaccard {jaccard:.4f} >= {threshold}). '
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
            f'(Jaccard {jaccard:.4f}). Aborting integrated workflow.'
        )

    # Below threshold — dataset is not flagged as a duplicate.
    # If the name contains _DUPLICATE_, record the near-miss so the UI can
    # display an informational alert about the similarity score.
    dataset_name = dataset.get('name', '')
    if '_DUPLICATE_' in dataset_name:
        logger.info(
            f'inspect_dataset[{dataset_id}]: similarity score {jaccard:.4f} is below '
            f'threshold {threshold}. Recording near-miss against dataset {original_id}.'
        )
        api.register_duplicate(
            dataset_id=dataset_id,
            original_dataset_id=original_id,
            comparison_process_id=None,
            comparison_status='NOT_DUPLICATE',
        )


def inspect_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)

    if dataset.get('is_deleted'):
        raise exc.InspectionFailed(f'Dataset {dataset_id} is already deleted; nothing to inspect.')

    source = Path(dataset['origin_path']).resolve()

    if not source.exists():
        raise exc.InspectionFailed(f'origin_path does not exist: {source}')

    du_size = cmd.total_size(source)
    num_files, num_directories, size, num_genome_files, metadata = generate_metadata(celery_task, source)

    update_data = {
        'du_size': du_size,
        'size': size,
        'num_files': num_files,
        'num_directories': num_directories,
        'metadata': {
            'num_genome_files': num_genome_files,
        }
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)

    # Write file metadata in batches to avoid oversized payloads
    for batch in utils.batched(metadata, n=config['inspect']['file_metadata_batch_size']):
        api.add_files_to_dataset(dataset_id=dataset_id, files=batch)

    # Mark the dataset as fully inspected so it becomes eligible as a comparison
    # target for future incoming datasets
    api.add_state_to_dataset(dataset_id, 'INSPECTED')
    logger.info(f'inspect_dataset[{dataset_id}]: marked as INSPECTED.')

    # Duplicate detection — only when the feature is enabled
    if config.get('enabled_features', {}).get('duplicate_detection', {}).get('enabled'):
        # Re-fetch with states so wait_for_concurrent_inspections can filter correctly
        fresh_dataset = api.get_dataset(dataset_id=dataset_id)
        run_duplicate_detection(celery_task, dataset_id, fresh_dataset)

    return dataset_id,

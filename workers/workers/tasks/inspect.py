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
from workers.dataset_duplication import run_duplicate_detection

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

    for batch in utils.batched(metadata, n=config['inspect']['file_metadata_batch_size']):
        api.add_files_to_dataset(dataset_id=dataset_id, files=batch)

    api.add_state_to_dataset(dataset_id, 'INSPECTED')
    logger.info(f'inspect_dataset[{dataset_id}]: marked as INSPECTED.')

    dup_feature = config.get('enabled_features', {}).get('duplicate_detection')
    if dup_feature is None:
        dup_enabled = True
    elif isinstance(dup_feature, bool):
        dup_enabled = dup_feature
    elif isinstance(dup_feature, dict):
        dup_enabled = bool(dup_feature.get('enabled'))
    else:
        dup_enabled = False

    if dup_enabled:
        fresh_dataset = api.get_dataset(dataset_id=dataset_id)
        run_duplicate_detection(celery_task, dataset_id, fresh_dataset)

    return dataset_id,

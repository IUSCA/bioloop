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
    source is a directory that exists and has to readable and executable (see files inside)
    all the files and directories under source should be readable
    returns:    number of files, 
                number of directories, 
                sum of stat size of all files, 
                number of genome data files,
                the md5 digest and relative filenames of genome data files
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
                # if symlink, only add the size of the symlink, not the pointed file
                file_size = p.lstat().st_size
                size += file_size
                # do not compute checksum for symlinks
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

    source = Path(dataset['origin_path']).resolve()
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
    api.add_files_to_dataset(dataset_id=dataset_id, files=metadata)
    api.add_state_to_dataset(dataset_id=dataset_id, state='INSPECTED')

    return dataset_id,

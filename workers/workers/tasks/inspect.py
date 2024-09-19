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
from workers.workflow_utils import generate_metadata

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


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

    return dataset_id,

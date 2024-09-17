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


def update_metadata(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)

    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    updated_dataset_extracted_path = working_dir / dataset['name']

    source = Path(updated_dataset_extracted_path).resolve()
    num_files, num_directories, size, num_genome_files, metadata = generate_metadata(celery_task, source)

    update_data = {
        'num_directories': num_directories,
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)

    return dataset_id,

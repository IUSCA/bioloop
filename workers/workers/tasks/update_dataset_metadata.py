from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask

import workers.api as api
import workers.sda as sda
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.workflow_utils import generate_metadata

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def compute_updated_checksum(celery_task: WorkflowTask, dataset: dict, delete_local_file: bool = False):
    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    new_bundle_path = working_dir / dataset['bundle']['name']

    updated_sda_bundle_checksum = sda.get_hash(f"{dataset['archive_path']}")

    bundle_size = new_bundle_path.stat().st_size
    bundle_attrs = {
        'size': bundle_size,
        'md5': updated_sda_bundle_checksum,
    }

    return bundle_attrs


def update_metadata(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    print(f"Old number of directories: {dataset['num_directories']}")

    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    updated_dataset_extracted_path = working_dir / dataset['name']

    source = Path(updated_dataset_extracted_path).resolve()
    num_files, num_directories, size, num_genome_files, metadata = generate_metadata(celery_task, source)

    print(f"New Number of directories: {num_directories}")

    bundle_attrs = compute_updated_checksum(celery_task, dataset)

    update_data = {
        'num_directories': num_directories,
        'bundle': bundle_attrs,
    }

    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    return dataset_id,

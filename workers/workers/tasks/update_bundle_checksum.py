import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask
import json

import workers.sda as sda
import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
import workers.workflow_utils as wf_utils
from workers.config import config

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


def update_bundle_checksum(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    bundle_attrs = compute_updated_checksum(celery_task, dataset)
    update_data = {
        'bundle': bundle_attrs
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)

    return dataset_id,

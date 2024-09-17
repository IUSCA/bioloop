import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask
import json

import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
import workers.workflow_utils as wf_utils
from workers.config import config
from workers.dataset import get_bundle_stage_temp_path
from workers.sda import sda

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def compute_updated_checksum(celery_task: WorkflowTask, dataset: dict, delete_local_file: bool = False):
    # Tar the dataset directory and compute checksum
    bundle_archive_path = dataset['archive_path']

    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    dataset_path = working_dir / dataset['name']
    new_bundle_path = working_dir / dataset['bundle']['name']

    updated_sda_bundle_checksum = sda.get_hash(f"{dataset['archive_path']}")

    bundle_size = new_bundle_path.stat().st_size
    bundle_attrs = {
        'size': bundle_size,
        'md5': updated_sda_bundle_checksum,
    }

    # sda_dir = wf_utils.get_archive_dir(dataset['type'])
    # sda_bundle_path = f'{sda_dir}/{bundle_archive_path.name}'

    # wf_utils.upload_file_to_sda(local_file_path=bundle_archive_path,
    #                             sda_file_path=sda_bundle_path,
    #                             celery_task=celery_task)

    if delete_local_file:
        # bundle successfully uploaded to SDA, delete the local copy
        print(f"deleting local bundle at {str(new_bundle_path)}")
        new_bundle_path.unlink()

    return bundle_attrs


def update_bundle_checksum(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    bundle_attrs = compute_updated_checksum(celery_task, dataset)
    update_data = {
        'bundle': bundle_attrs
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='ARCHIVED')

    return dataset_id,

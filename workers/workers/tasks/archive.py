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
from dataset import get_bundle_staged_path
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def archive(celery_task: WorkflowTask, dataset: dict, delete_local_file: bool = False):
    # Tar the dataset directory and compute checksum
    bundle = Path(f'{get_bundle_staged_path(dataset)}')

    wf_utils.make_tarfile(celery_task=celery_task,
                 tar_path=bundle,
                 source_dir=dataset['origin_path'],
                 source_size=dataset['du_size'])

    bundle_size = bundle.stat().st_size
    bundle_checksum = utils.checksum(bundle)
    bundle_attrs = {
        'name': bundle.name,
        'size': bundle_size,
        'md5': bundle_checksum,
    }

    sda_dir = wf_utils.get_archive_dir(dataset['type'])
    sda_bundle_path = f'{sda_dir}/{bundle.name}'

    wf_utils.upload_file_to_sda(local_file_path=bundle,
                                sda_file_path=sda_bundle_path,
                                celery_task=celery_task)

    if delete_local_file:
        # file successfully uploaded to SDA, delete the local copy
        print("deleting local bundle")
        bundle.unlink()

    return sda_bundle_path, bundle_attrs


def archive_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    sda_bundle_path, bundle_attrs = archive(celery_task, dataset)
    update_data = {
        'archive_path': sda_bundle_path,
        'bundle': bundle_attrs
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='ARCHIVED')

    return dataset_id,

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
from dataset import get_bundle_staged_path, compute_staging_path
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def recreate_bundle(celery_task, dataset_id, **kwargs):
    # mark dataset as not staged in the database (which has been set
    # to True by the validate step before this step), since the tar file
    # with the correct path has not been created yet.
    update_data = {
        'is_staged': False,
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)

    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    downloaded_bundle_path = Path(f'{get_bundle_staged_path(dataset)}')
    dataset_staging_dir = compute_staging_path(dataset)

    print(f'Recomputing checksum for dataset {dataset_id} bundle {str(downloaded_bundle_path)}')
    utils.make_tarfile(celery_task=celery_task,
                       tar_path=downloaded_bundle_path,
                       source_dir=str(dataset_staging_dir),
                       source_size=dataset['du_size'])

    recomputed_bundle_size = downloaded_bundle_path.stat().st_size
    recomputed_bundle_checksum = utils.checksum(downloaded_bundle_path)

    # todo - recompute size?
    update_data = {
        'size': recomputed_bundle_size,
        'md5': recomputed_bundle_checksum,
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)

    return dataset_id,

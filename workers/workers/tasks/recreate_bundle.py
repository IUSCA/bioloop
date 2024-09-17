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
    # mark dataset as not staged in the database (`is_staged` would have been
    # set to True by the 'validate' step which runs before this step), since
    # the bundle file with the updated paths has not been retrieved from the SDA
    # and staged yet.
    bundle_update_payload = {
        'is_staged': False,
    }
    api.update_dataset(dataset_id=dataset_id, update_data=bundle_update_payload)

    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    downloaded_bundle_path = Path(f'{get_bundle_staged_path(dataset)}')
    dataset_staging_dir = compute_staging_path(dataset)

    wf_utils.make_tarfile(celery_task=celery_task,
                       tar_path=downloaded_bundle_path,
                       source_dir=str(dataset_staging_dir),
                       source_size=dataset['du_size'])

    recomputed_bundle_size = downloaded_bundle_path.stat().st_size
    recomputed_bundle_checksum = utils.checksum(downloaded_bundle_path)

    bundle_update_payload = {
        'bundle': {
            'size': recomputed_bundle_size,
            'md5': recomputed_bundle_checksum,
        },
    }
    api.update_dataset(dataset_id=dataset_id, update_data=bundle_update_payload)

    return dataset_id,

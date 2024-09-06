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
import workers.sda as sda

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def replace_sda_archive(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    bundle_path = Path(get_bundle_staged_path(dataset))

    sda_archive_path = wf_utils.get_archive_dir(dataset['type'])

    sda_current_bundle_path = f"{sda_archive_path}/{bundle_path.name}"
    print(f"SDA current bundle path: {sda_current_bundle_path}")

    sda_updated_bundle_path = f'{sda_archive_path}/updated_{bundle_path.name}'
    print(f"SDA updated bundle path: {sda_updated_bundle_path}")

    # no need to verify checksum, since the current tar on the SDA will have a
    # different checksum than the newly created tar, due to incorrect nested
    # paths in the current tar on the SDA.
    wf_utils.upload_file_to_sda(local_file_path=bundle_path,
                                sda_file_path=sda_updated_bundle_path,
                                celery_task=celery_task,
                                verify_checksum=False)
    print(f"Uploaded archive {bundle_path} to SDA at {sda_updated_bundle_path}")

    # todo - verify that the replaced SDA bundle has the same checksum as the newly created tar

    sda.rename(sda_current_bundle_path, f'original_{sda_current_bundle_path}')
    print(f"Renamed SDA bundle {sda_current_bundle_path} to original_{sda_updated_bundle_path}")

    sda.rename(sda_updated_bundle_path, bundle_path.name)
    print(f"Renamed SDA bundle {sda_updated_bundle_path} to {bundle_path.name}")

    return dataset_id,

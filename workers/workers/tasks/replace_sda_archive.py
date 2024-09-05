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


def replace_sda_archive(celery_task, dataset_id, **kwargs):
    # mark dataset as not staged in the database (which has been set
    # to True by the validate step before this step), since the tar file
    # with the correct path has not been created yet.

    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    bundle_path = Path(get_bundle_staged_path(dataset))

    sda_dir = wf_utils.get_archive_dir(dataset['type'])
    sda_bundle_path = f'{sda_dir}/temp_{bundle_path.name}'

    # no need to verify checksum, since the current tar on the SDA will have a
    # different checksum than the newly created tar, due to incorrect nested
    # paths in the current tar on the SDA.
    wf_utils.upload_file_to_sda(local_file_path=bundle_path,
                                sda_file_path=sda_bundle_path,
                                celery_task=celery_task,
                                verify_checksum=False)

    # todo - verify that the replaced SDA bundle has the same checksum as the newly created tar

    return dataset_id,

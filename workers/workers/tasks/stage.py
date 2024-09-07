import os
import shutil
import tarfile
import tempfile
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask

import workers.api as api
import workers.utils as utils
from workers.config import config
import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils
from workers.dataset import compute_staging_path
from workers.dataset import compute_bundle_path, get_bundle_staged_path
from workers import exceptions as exc

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def stage(celery_task: WorkflowTask, dataset: dict) -> (str, str):
    """
    gets the tar from SDA and extracts it

    input: dataset['name'], dataset['archive_path'] should exist
    returns: stage_path
    """
    staging_dir, alias = compute_staging_path(dataset)
    bundle_alias = compute_bundle_path(dataset)

    sda_bundle_path = dataset['archive_path']
    alias_dir = staging_dir.parent
    alias_dir.mkdir(parents=True, exist_ok=True)

    bundle = dataset["bundle"]
    bundle_md5 = bundle["md5"]
    bundle_download_path = Path(get_bundle_staged_path(dataset=dataset))

    wf_utils.download_file_from_sda(sda_file_path=sda_bundle_path,
                                    local_file_path=bundle_download_path,
                                    celery_task=celery_task)

    evaluated_checksum = utils.checksum(bundle_download_path)
    if evaluated_checksum != bundle_md5:
        raise exc.ValidationFailed(f'Expected checksum of downloaded file to be {bundle_md5},'
                                   f' but evaluated checksum was {evaluated_checksum}')

    # extract the tar file to stage directory
    logger.info(f'extracting tar {bundle_download_path} to {staging_dir}')
    wf_utils.extract_tarfile(tar_path=bundle_download_path, target_dir=staging_dir, override_arcname=True)

    # delete the local tar copy after extraction
    # bundle_path.unlink()

    return str(staging_dir), alias, bundle_alias


def stage_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    staged_path, alias, bundle_alias = stage(celery_task, dataset)

    update_data = {
        'staged_path': staged_path,
        'metadata': {
            'stage_alias': alias,
            'bundle_alias': bundle_alias
        }
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='FETCHED')
    return dataset_id,

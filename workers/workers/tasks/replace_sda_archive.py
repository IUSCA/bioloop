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
from workers.dataset import get_bundle_staged_path
from workers.config import config
import workers.sda as sda
from workers.exceptions import ValidationFailed

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def replace_sda_archive(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    bundle = dataset['bundle']

    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    new_tar_path = working_dir / dataset['bundle']['name']

    bundle_path = Path(get_bundle_staged_path(dataset))
    sda_archive_path = wf_utils.get_archive_dir(dataset['type'])

    sda_current_bundle_path = f"{dataset['archive_path']}"
    sda_updated_bundle_path = f'{sda_archive_path}/{bundle_path.name}_updated'

    if sda.exists(sda_updated_bundle_path):
        sda.delete(sda_updated_bundle_path)    

    wf_utils.upload_file_to_sda(local_file_path=new_tar_path,
                                sda_file_path=sda_updated_bundle_path,
                                celery_task=celery_task)

    persisted_bundle_checksum = bundle['md5']
    sda.rename(sda_current_bundle_path, f'{sda_current_bundle_path}_original')

    sda.rename(sda_updated_bundle_path, bundle_path.name)

    # verify that the replaced SDA bundle has the same checksum as the newly created bundle
    updated_sda_bundle_checksum = sda.get_hash(f"{sda_archive_path}/{bundle_path.name}")

    new_tar_checksum = utils.checksum(Path(new_tar_path))
    
    if updated_sda_bundle_checksum != new_tar_checksum:
        # rename the original SDA bundle back to its original name
        sda.rename(f'original_{sda_updated_bundle_path}', dataset['bundle']['name'])
        print(f"Checksum validation failed. Renaming original SDA bundle 'original_{sda_updated_bundle_path}'\
               back to its original name: {dataset['bundle']['name']}")

        raise ValidationFailed(f"Checksum validation failed for updated SDA bundle: {sda_archive_path}/{bundle_path.name},\
 for dataset_id: {dataset_id}. Updated SDA bundle checksum: {updated_sda_bundle_checksum}, new tar checksum: {new_tar_checksum}")
    else:
        # remove the original SDA bundle
        sda.delete(bundle_path.name)

    return dataset_id,

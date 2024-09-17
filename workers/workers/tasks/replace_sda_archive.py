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


def replace_sda_archive(celery_task, ret_val, **kwargs):
    dataset_id, has_incorrect_paths = ret_val

    if not has_incorrect_paths:
        print(f"No incorrect paths found for dataset {dataset_id}. SDA Archive will not be replaced.")
        return dataset_id, has_incorrect_paths

    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    bundle = dataset['bundle']

    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    new_tar_path = working_dir / dataset['bundle']['name']

    bundle_path = Path(get_bundle_staged_path(dataset))
    sda_archive_path = wf_utils.get_archive_dir(dataset['type'])

    sda_current_bundle_path = f"{dataset['archive_path']}"
    print(f"SDA current bundle path: {sda_current_bundle_path}")

    sda_new_bundle_path = f"{sda_archive_path}/{bundle['name']}_updated"
    print(f"SDA updated bundle path: {sda_new_bundle_path}")

    if sda.exists(sda_new_bundle_path):
        sda.delete(sda_new_bundle_path)

    wf_utils.upload_file_to_sda(local_file_path=new_tar_path,
                                sda_file_path=sda_new_bundle_path,
                                celery_task=celery_task)

    persisted_bundle_checksum = bundle['md5']

    # make a copy of the original SDA bundle
    sda_original_bundle_clone = f'{sda_current_bundle_path}_original'
    sda.rename(sda_current_bundle_path, sda_original_bundle_clone)
    print(f"Renamed SDA bundle {sda_current_bundle_path} to {sda_original_bundle_clone}")

    # rename the updated SDA bundle to its original name
    sda.rename(sda_new_bundle_path, sda_current_bundle_path)
    print(f"Renamed SDA bundle {sda_new_bundle_path} to {sda_current_bundle_path}")

    # verify that the replaced SDA bundle has the same checksum as the newly created bundle
    new_sda_checksum = sda.get_hash(f"{sda_current_bundle_path}")
    local_tar_checksum = utils.checksum(Path(new_tar_path))
    
    if new_sda_checksum != local_tar_checksum:
        # rename the original SDA bundle back to its original name
        sda.rename(sda_current_bundle_path, sda_new_bundle_path)
        sda.rename(sda_original_bundle_clone, sda_current_bundle_path)
        print(f"Checksum validation failed. Renaming original SDA bundle '{sda_original_bundle_clone}'\
               back to its original name: {sda_current_bundle_path}")

        raise ValidationFailed(f"Checksum validation failed for updated SDA bundle: {sda_current_bundle_path},\
 for dataset_id: {dataset_id}. Updated SDA bundle checksum: {new_sda_checksum}, new tar checksum: {local_tar_checksum}")
    else:
        # remove the original SDA bundle
        print(f"Checksum validation passed. Deleting original SDA bundle: {sda_original_bundle_clone}")
        sda.delete(sda_original_bundle_clone)

    return (dataset_id, has_incorrect_paths),

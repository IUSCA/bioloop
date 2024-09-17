import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask
import os
import pprint

from workers.exceptions import ValidationFailed
import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
import workers.workflow_utils as wf_utils
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)



def fix_staged_dataset_absolute_path(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)

    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    working_dir.mkdir(parents=True, exist_ok=True)

    archive_download_path = working_dir / dataset['bundle']['name']

    # delete bundle if it already exists
    if archive_download_path.exists():
        archive_download_path.unlink()

    sda_archive_path = dataset['archive_path']
    wf_utils.download_file_from_sda(sda_archive_path, archive_download_path)

    archive_extracted_to_dir = Path(working_dir / f"{dataset['name']}_temp_extract_location")
    if archive_extracted_to_dir.exists():
        shutil.rmtree(archive_extracted_to_dir)

    print(f'archive_extracted_to_dir: {str(archive_extracted_to_dir)}, exists: {archive_extracted_to_dir.exists()}')

    wf_utils.extract_tarfile(tar_path=archive_download_path,
                             target_dir=archive_extracted_to_dir / 'fixed_paths',
                             override_arcname=False)

    incorrect_nested_path = archive_extracted_to_dir / config['registration'][dataset['type']]['source_dir'][1:] / dataset["name"]
    has_incorrect_path = incorrect_nested_path.exists()

    if has_incorrect_path:
        print(f'Incorrect nested path: {incorrect_nested_path} found')

        if (working_dir / dataset['name']).exists():
            shutil.rmtree(working_dir / dataset['name'])
        shutil.move(incorrect_nested_path, working_dir)

        shutil.rmtree(archive_extracted_to_dir)

        new_tar_path = working_dir / dataset['bundle']['name']
        # make archive from fixed dataset
        updated_dataset_path = str(working_dir / dataset['name'])
        wf_utils.make_tarfile(celery_task=celery_task,
                                tar_path=new_tar_path,
                                source_dir=updated_dataset_path,
                                source_size=dataset['du_size'])
    else:
        print(f'Directory {str(incorrect_nested_path)} does not exist.')

    return (dataset_id, has_incorrect_path), 

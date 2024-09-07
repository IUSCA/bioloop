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


def fix_staged_dataset_absolute_path(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)

    bundle_path = Path(f'{get_bundle_staged_path(dataset)}')
    print(f'bundle path: {str(bundle_path)}')

    # delete bundle if it already exists
    if bundle_path.exists():
        print(f"deleting bundle path {str(bundle_path)}")
        shutil.rmtree(bundle_path)
        print(f"deleted bundle path {str(bundle_path)}")

    # sda_retrieved_bundles_path = bundle_path.parent / 'sda_retrieved_bundles'
    # sda_retrieved_bundles_path.mkdir(exist_ok=True)
    # print(f"sda_retrieved_bundles_path: {sda_retrieved_bundles_path.exists()}")

    sda_archive_path = dataset['archive_path']
    print(f'Downloading {sda_archive_path} to {str(bundle_path)}')
    wf_utils.download_file_from_sda(sda_archive_path, bundle_path)
    print(f'Downloaded {sda_archive_path} to {str(bundle_path)}')

    (staging_dir) = compute_staging_path(dataset)

    print(f'Extracting {str(bundle_path)} to {str(staging_dir)}')
    wf_utils.extract_tarfile(tar_path=bundle_path, target_dir=staging_dir, override_arcname=True)
    print(f'Extracted {str(bundle_path)} to {str(staging_dir)}')

    # verify if the extracted bundle already has the correct root path
    if staging_dir.name != dataset['name']:
        print(f'Expected staging_dir {str(staging_dir)}\'s root directory to be {dataset["name"]}, but found {staging_dir.name}')
        extracted_dataset_dir = next(Path(staging_dir).glob(f'**/{dataset["name"]}'))
        print(f'found {str(extracted_dataset_dir)} inside {str(staging_dir)}')
        shutil.move(extracted_dataset_dir, staging_dir)
        print(f'moved {str(extracted_dataset_dir)} to {str(staging_dir)}')

        print(f'deleting {str(staging_dir)}')
        shutil.rmtree(staging_dir)
        print(f'deleted {str(staging_dir)}')

    return dataset_id,

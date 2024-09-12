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
from workers.dataset import get_bundle_stage_temp_path
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)



def fix_staged_dataset_absolute_path(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)

    temp_bundles_extraction_dir = get_bundle_stage_temp_path(dataset).parent / 'temp_extraction_dir'
    print(f'temp_bundles_extraction_dir: {str(temp_bundles_extraction_dir)}')
    temp_bundles_extraction_dir.mkdir(exist_ok=True)

    temp_bundle_download_path = temp_bundles_extraction_dir / dataset['bundle']['name']
    print(f'temp_bundle_download_path: {str(temp_bundle_download_path)}')

    # delete bundle if it already exists
    if temp_bundle_download_path.exists():
        print(f"temp_bundle_download_path {temp_bundle_download_path} already exists, deleting path {str(temp_bundle_download_path)}")
        shutil.rmtree(temp_bundle_download_path)
        print(f"deleted temp_bundle_download_path {str(temp_bundle_download_path)}")

    # sda_retrieved_bundles_path = bundle_path.parent / 'sda_retrieved_bundles'
    # sda_retrieved_bundles_path.mkdir(exist_ok=True)
    # print(f"sda_retrieved_bundles_path: {sda_retrieved_bundles_path.exists()}")

    sda_archive_path = dataset['archive_path']
    print(f'Downloading {sda_archive_path} to {str(temp_bundle_download_path)}')
    wf_utils.download_file_from_sda(sda_archive_path, temp_bundle_download_path)
    print(f'Downloaded {sda_archive_path} to {str(temp_bundle_download_path)}')

    # temp_bundles_extracted_dir = compute_staging_path(dataset)
    temp_bundle_extracted_dir = temp_bundles_extraction_dir / f"{dataset['name']}_extracted"
    if temp_bundle_extracted_dir.exists():
        shutil.rmtree(temp_bundle_extracted_dir)
    
    temp_bundle_extracted_dir.mkdir()

    # print(f'temp_bundle_download_path: {str(bundle_path)} to {str(staging_dir)}')
    wf_utils.extract_tarfile(tar_path=temp_bundle_download_path, target_dir=temp_bundle_extracted_dir, override_arcname=True)
    print(f'Extracted {str(temp_bundle_download_path)} inside {str(temp_bundle_extracted_dir)}')

    # bundle_temp_extraction_path = temp_bundles_extraction_dir / f"{dataset['name']}_extracted"

    # if not bundle_temp_extraction_path.exists():
    #     print(f'No directory found inside {str(temp_bundles_extraction_dir)} with name {dataset["name"]}')


    # print(f'bundle_temp_extraction_path: {str(bundle_temp_extraction_path)}')

    extracted_bundle_dirs = [dir for dir in os.listdir(temp_bundle_extracted_dir) if os.isdir(os.path.join(temp_bundle_extracted_dir, dir))]
    print(f'extracted_bundle_dirs: {pprint(extracted_bundle_dirs)}')
    
    if len(extracted_bundle_dirs) > 1:
        raise ValidationFailed(f'Expected one, but found more than one directories inside extracted_bundle_dirs: {extracted_bundle_dirs}')
    
    extracted_bundle_root_dir = extracted_bundle_dirs[0]
    if extracted_bundle_root_dir != dataset['name']:
        print(f'Expected {str(extracted_bundle_root_dir)}\'s root directory to be {dataset["name"]}, but found {extracted_bundle_root_dir.name}')
        nested_dataset_dir = next(Path(extracted_bundle_root_dir).glob(f'**/{dataset["name"]}'))

        print(f'found {str(nested_dataset_dir)} inside {str(extracted_bundle_root_dir)}')
        shutil.move(nested_dataset_dir, temp_bundles_extraction_dir)
        print(f'moved {str(nested_dataset_dir)} to {str(temp_bundles_extraction_dir)}')

        print(f'deleting {str(extracted_bundle_root_dir)}')
        shutil.rmtree(extracted_bundle_root_dir)
        print(f'deleted {str(extracted_bundle_root_dir)}')

        new_tar_path = Path(temp_bundles_extraction_dir) / dataset['bundle']['name']
        # make archive from fixed dataset
        print(f'Making archive for dataset id: {dataset_id} to {str(new_tar_path)}')
        
        updated_dataset_extracted_path = str(temp_bundles_extraction_dir / nested_dataset_dir)
        
        wf_utils.make_tarfile(celery_task=celery_task,
                           tar_path=new_tar_path,
                           source_dir=updated_dataset_extracted_path,
                           source_size=dataset['du_size'])
        print(f'Made archive from fixed dataset')

    return dataset_id, str(updated_dataset_extracted_path)

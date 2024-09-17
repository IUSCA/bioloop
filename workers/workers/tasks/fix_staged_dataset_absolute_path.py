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

    print(f'fix_staged_dataset_absolute_path called for dataset_id: {dataset_id}')

    print('config:')

    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    print(f'working_dir: {str(working_dir)}')
    working_dir.mkdir(parents=True, exist_ok=True)

    archive_download_path = working_dir / dataset['bundle']['name']
    print(f'archive_download_path: {str(archive_download_path)}')

    # delete bundle if it already exists
    if archive_download_path.exists():
        print(f"archive_download_path {archive_download_path} already exists, deleting path {str(archive_download_path)}")
        archive_download_path.unlink()
        print(f"deleted archive_download_path {str(archive_download_path)}")

    # sda_retrieved_bundles_path = bundle_path.parent / 'sda_retrieved_bundles'
    # sda_retrieved_bundles_path.mkdir(exist_ok=True)
    # print(f"sda_retrieved_bundles_path: {sda_retrieved_bundles_path.exists()}")

    sda_archive_path = dataset['archive_path']
    print(f'Downloading {sda_archive_path} to {str(archive_download_path)}')
    wf_utils.download_file_from_sda(sda_archive_path, archive_download_path)
    print(f'Downloaded {sda_archive_path} to {str(archive_download_path)}')

    # temp_bundles_extracted_dir = compute_staging_path(dataset)

    # 'fixed_paths' is subdirectory will never be used. The dataset will be extracted by
    # `extract_tarfile()` to it's parent directory.
    archive_extracted_to_dir = Path(working_dir / f"{dataset['name']}_fix_paths")
    if archive_extracted_to_dir.exists():
        print(f"archive_extracted_to_dir {archive_extracted_to_dir} already exists, deleting path {str(archive_extracted_to_dir)}")
        shutil.rmtree(archive_extracted_to_dir)
        print(f"Deleted archive_extracted_to_dir {str(archive_extracted_to_dir)}")
    else:
        print(f'Directory {archive_extracted_to_dir} does not exist')

    print(f'archive_extracted_to_dir: {str(archive_extracted_to_dir)}, exists: {archive_extracted_to_dir.exists()}')


    # archive_extracted_to_dir.mkdir(parents=True)
    # print(f'Created archive_extracted_to_dir {str(archive_extracted_to_dir)}')

    # Extracts to `temp_bundles_extraction_dir / f"{dataset['name']}"`. 'fixed_path' subdirectory is not actually used.
    wf_utils.extract_tarfile(tar_path=archive_download_path, target_dir=archive_extracted_to_dir / 'fixed_paths', override_arcname=False)
    
    # print(f'Extracted dir exists: {archive_extracted_to_dir.exists()}')

    # TODO - verify that the origin path is embedded in the extracted tar file

    # bundle_temp_extraction_path = temp_bundles_extraction_dir / f"{dataset['name']}_extracted"

    # if not bundle_temp_extraction_path.exists():
    #     print(f'No directory found inside {str(temp_bundles_extraction_dir)} with name {dataset["name"]}')


    # print(f'bundle_temp_extraction_path: {str(bundle_temp_extraction_path)}')

    extracted_archive_dirs = [dir for dir in os.listdir(archive_extracted_to_dir) if os.path.isdir(os.path.join(archive_extracted_to_dir, dir))]
    # print(f'extracted_bundle_dirs: {pprint(extracted_bundle_dirs)}')
    
    if len(extracted_archive_dirs) > 1:
        raise ValidationFailed(f'Expected one, but found more than one directories inside extracted_bundle_dirs: {extracted_archive_dirs}')
    
    extracted_archive_root_dir = extracted_archive_dirs[0]
    print(f'extracted_bundle_root_dir: {extracted_archive_root_dir}')

    if extracted_archive_root_dir != dataset['name']:
        print(f'Expected dataset {dataset_id}\'s root directory after extraction to be {dataset["name"]}, but found {extracted_archive_root_dir}')
        
        root_dir = archive_extracted_to_dir / extracted_archive_root_dir
        print(f"extracted_bundle_root_dir: {str(root_dir)}")
        nested_dataset_dir = next(Path(root_dir).glob(f'**/{dataset["name"]}'))
                          

        #TODO - throw if nested directory with dataset's name is not found

        print(f'found {str(nested_dataset_dir)} inside {str(root_dir)}')
        if (working_dir / dataset['name']).exists():
            shutil.rmtree(working_dir / dataset['name'])
        shutil.move(nested_dataset_dir, working_dir)
        print(f'moved {str(nested_dataset_dir)} inside {str(working_dir)}')

        print(f'deleting {str(root_dir)}')
        shutil.rmtree(root_dir)
        print(f'deleted {str(root_dir)}')

        new_tar_path = working_dir / dataset['bundle']['name']
        # make archive from fixed dataset
        updated_dataset_path = str(working_dir / dataset['name'])
        print(f'Making archive for dataset id: {dataset_id}, source {str(updated_dataset_path)} at {str(new_tar_path)}')
        
        wf_utils.make_tarfile(celery_task=celery_task,
                           tar_path=new_tar_path,
                           source_dir=updated_dataset_path,
                           source_size=dataset['du_size'])
        print(f'Made archive from fixed dataset')

    return dataset_id,

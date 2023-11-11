import os
import shutil
import tarfile
import tempfile
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask

import workers.api as api
import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils
from workers.dataset import compute_staging_path

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def extract_tarfile(tar_path: Path, target_dir: Path, override_arcname=False):
    """
    tar_path: path to the tar file to extract
    target_dir: path to the top level directory after extraction

    extracts the tar file to  target_dir.parent directory.

    The directory created here after extraction will have the same name as the top level directory inside the archive.

    If that is not desired and the name of the directory created needs to be the same as target_dir.name,
    then set override_arcname = True

    If a directory with the same name as extracted dir already exists, it will be deleted.
    @param tar_path:
    @param target_dir:
    @param override_arcname:
    """
    with tarfile.open(tar_path, mode='r') as archive:
        # find the top-level directory in the extracted archive
        archive_name = os.path.commonprefix(archive.getnames())
        extraction_dir = target_dir if override_arcname else (target_dir.parent / archive_name)

        # if extraction_dir exists then delete it
        if extraction_dir.exists():
            shutil.rmtree(extraction_dir)

        # create parent directories if missing
        extraction_dir.parent.mkdir(parents=True, exist_ok=True)

        # extracts the tar contents to a temp directory
        # move the contents to the extraction_dir
        with tempfile.TemporaryDirectory(dir=extraction_dir.parent) as tmp_dir:
            archive.extractall(path=tmp_dir)
            shutil.move(Path(tmp_dir) / archive_name, extraction_dir)


def stage(celery_task: WorkflowTask, dataset: dict) -> str:
    """
    gets the tar from SDA and extracts it

    input: dataset['name'], dataset['archive_path'] should exist
    returns: stage_path
    """
    staging_dir, alias = compute_staging_path(dataset)

    sda_tar_path = dataset['archive_path']
    # staging_dir.parent = the alias sub-directory
    alias_dir = staging_dir.parent
    alias_dir.mkdir(parents=True, exist_ok=True)
    scratch_tar_path = Path(f'{str(alias_dir)}/{dataset["name"]}.tar')
    wf_utils.download_file_from_sda(sda_file_path=sda_tar_path,
                                    local_file_path=scratch_tar_path,
                                    celery_task=celery_task)

    # extract the tar file to stage directory
    logger.info(f'extracting tar {scratch_tar_path} to {staging_dir}')
    extract_tarfile(tar_path=scratch_tar_path, target_dir=staging_dir, override_arcname=True)

    # delete the local tar copy after extraction
    # scratch_tar_path.unlink()

    return alias


def stage_dataset(celery_task, dataset_id, **kwargs):
    print('STAGE WORKER CALLED')

    dataset = api.get_dataset(dataset_id=dataset_id)
    alias = stage(celery_task, dataset)

    update_data = {
        'metadata': {
            'stage_alias': alias
        }
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='FETCHED')
    return dataset_id,

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
import workers.sda as sda
import workers.utils as utils
import workers.workflow_utils as wf_utils
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def download_file_from_sda(celery_task: WorkflowTask, sda_file_path: str, local_file_path: Path):
    """
    Before downloading, check if the file exists and the checksums match.
    If not, download from SDA and validate if the checksums match.
    """
    sda_digest = sda.get_hash(sda_path=sda_file_path)
    logger.info(f'sda_digest of {sda_file_path} : {sda_digest}')

    file_exists = False
    if local_file_path.exists() and local_file_path.is_file():
        # if local file exists, validate checksum against SDA
        logger.info(f'computing checksum of local file {local_file_path}')
        local_digest = utils.checksum(local_file_path)
        if sda_digest == local_digest:
            file_exists = True
            logger.warning(f'local file exists and the checksums match - not getting from the SDA')

    if not file_exists:
        logger.info('getting file from SDA')

        # delete the local file if possible
        local_file_path.unlink(missing_ok=True)
        source_size = sda.get_size(sda_file_path)

        with utils.track_progress_parallel(celery_task=celery_task,
                                           name='sda get',
                                           progress_fn=lambda: local_file_path.stat().st_size,
                                           total=source_size,
                                           units='bytes'):
            sda.get(sda_file=sda_file_path, local_file=str(local_file_path), verify_checksum=True)


def extract_tarfile(tar_path: Path, target_dir: Path, override_arcname=False):
    """
    tar_path: path to the tar file to extract
    target_dir: path to the top level directory after extraction

    extracts the tar file to  target_dir.parent directory.

    The directory created here after extraction will have the same name as the top level directory inside the archive.

    If that is not desired and the name of the directory created needs to be the same as target_dir.name,
    then set override_arcname = True

    If a directory with the same name as extracted dir already exists, it will be deleted.
    """
    with tarfile.open(tar_path, mode='r') as archive:
        # find the top-level directory in the extracted archive
        archive_name = os.path.commonprefix(archive.getnames())
        extraction_dir = target_dir if override_arcname else (target_dir.parent / archive_name)

        # if extraction_dir exists then delete it
        if extraction_dir.exists():
            shutil.rmtree(extraction_dir)

        # extracts the tar contents to temp directory
        # move the contents to extraction_dir
        with tempfile.TemporaryDirectory(dir=target_dir.parent) as tmpdir:
            archive.extractall(path=tmpdir)
            shutil.move(Path(tmpdir) / archive_name, extraction_dir)


def stage(celery_task: WorkflowTask, dataset: dict) -> None:
    """
    gets the tar from SDA and extracts it

    input: dataset['name'], dataset['archive_path'] should exist
    returns: stage_path
    """

    sda_tar_path = dataset['archive_path']
    scratch_tar_path = Path(config['paths']['scratch']) / f"{dataset['name']}.tar"
    download_file_from_sda(celery_task=celery_task,
                           sda_file_path=sda_tar_path,
                           local_file_path=scratch_tar_path)

    # extract the tar file to stage directory
    dataset_type = dataset['type'].lower()
    staging_dir = Path(config['paths'][dataset_type]['stage'])
    target_dir = staging_dir / dataset['name']  # path to the staged dataset

    logger.info(f'extracting tar {scratch_tar_path} to {target_dir}')
    extract_tarfile(tar_path=scratch_tar_path, target_dir=target_dir, override_arcname=True)

    # delete the local tar copy after extraction
    # scratch_tar_path.unlink()


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('stage_dataset'))
def stage_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    stage(celery_task, dataset)

    api.add_state_to_dataset(dataset_id=dataset_id, state='STAGED')
    return dataset_id,

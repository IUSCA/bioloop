import shutil
import tarfile
from pathlib import Path

from celery import Celery
from sca_rhythm import WorkflowTask

import workers.api as api
import workers.config.celeryconfig as celeryconfig
import workers.sda as sda
import workers.utils as utils
import workers.workflow_utils as wf_utils
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)


def download_file_from_sda(celery_task: WorkflowTask, sda_file_path: str, local_file_path: Path):
    """
    Before downloading, check if the file exists and checksums match.
    If not, download from SDA and validate if the checksums match.
    """
    sda_digest = sda.get_hash(sda_path=sda_file_path)

    file_exists = False
    if local_file_path.exists() and local_file_path.is_file():
        # if local file exists, validate checksum against SDA
        local_digest = utils.checksum(local_file_path)
        if sda_digest == local_digest:
            file_exists = True

    if not file_exists:
        # delete the local file if possible
        local_file_path.unlink(missing_ok=True)
        source_size = sda.get_size(sda_file_path)

        with utils.track_progress_parallel(progress_fn=utils.file_progress,
                                           progress_fn_args=(celery_task, local_file_path, source_size, 'sda_get')):
            sda.get(source=sda_file_path, target=str(local_file_path))

        # after getting the file from SDA, validate its checksum
        local_digest = utils.checksum(local_file_path)
        if sda_digest != local_digest:
            raise Exception(f'Stage failed: Checksums of local {local_file_path} ({local_digest})' +
                            f'and SDA {sda_file_path} ({sda_digest}) do not match')


def extract_tarfile(source: Path, target_dir: Path):
    extraction_dir = target_dir / source.stem
    if extraction_dir.exists():
        shutil.rmtree(extraction_dir)
    with tarfile.open(source) as tar:
        tar.extractall(path=target_dir)


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

    # extract the tar file
    dataset_type = dataset['type'].lower()
    staging_dir = Path(config['paths'][dataset_type]['stage'])
    extract_tarfile(source=scratch_tar_path, target_dir=staging_dir)
    # check for name conflicts in stage dir and delete dir if exists

    # delete the local tar copy after extraction
    scratch_tar_path.unlink()


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('stage_dataset'))
def stage_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    stage(celery_task, dataset)

    api.add_state_to_dataset(dataset_id=dataset_id, state='STAGED')
    return dataset_id,

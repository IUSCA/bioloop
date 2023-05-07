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


def get_dataset_from_sda(celery_task, dataset):
    """
    gets the tar from SDA and extracts it

    input: dataset['name'], dataset['archive_path'] should exist
    returns: stage_path
    """

    sda_tar_path = dataset['archive_path']
    dataset_type = dataset['type'].lower()
    staging_dir = Path(config['paths'][dataset_type]['stage'])
    scratch_tar_path = Path(config['paths']['scratch']) / f"{dataset['name']}.tar"
    sda_digest = sda.get_hash(sda_path=sda_tar_path)

    # check if tar file is already downloaded
    tarfile_exists = False
    if scratch_tar_path.exists() and scratch_tar_path.is_file() and tarfile.is_tarfile(scratch_tar_path):
        # if tar file exists, validate checksum against SDA
        scratch_digest = utils.checksum(scratch_tar_path)
        if sda_digest == scratch_digest:
            tarfile_exists = True

    if not tarfile_exists:
        # get the tarfile from SDA to scratch
        scratch_tar_path.unlink(missing_ok=True)
        source_size = sda.get_size(sda_tar_path)

        with utils.track_progress_parallel(progress_fn=utils.file_progress,
                                           progress_fn_args=(celery_task, scratch_tar_path, source_size, 'sda_get')):
            sda.get(source=sda_tar_path, target_dir=scratch_tar_path.parent)

        # after getting the file from SDA, validate the checksum
        scratch_digest = utils.checksum(scratch_tar_path)
        if sda_digest != scratch_digest:
            raise Exception(f'Stage failed: Checksums of local {scratch_tar_path} ({scratch_digest})' +
                            'and SDA {sda_tar_path} ({sda_digest}) do not match')

    # extract the tar file
    # check for name conflicts in stage dir and delete dir if exists
    extracted_dir_name = staging_dir / dataset['name']
    if extracted_dir_name.exists():
        shutil.rmtree(extracted_dir_name)
    with tarfile.open(scratch_tar_path) as tar:
        tar.extractall(path=staging_dir)

    # delete the local tar copy after extraction
    scratch_tar_path.unlink()
    return str(extracted_dir_name)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('stage_dataset'))
def stage_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    extracted_dir_name = get_dataset_from_sda(celery_task, dataset)

    api.add_state_to_dataset(dataset_id=dataset_id, state='STAGED')
    return dataset_id,

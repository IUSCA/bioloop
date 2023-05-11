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


def make_tarfile(celery_task: WorkflowTask, tar_path: Path, source_dir: str, source_size: int):
    logger.info(f'creating tar of {source_dir} at {tar_path}')
    # if the tar file already exists, delete it
    if tar_path.exists():
        tar_path.unlink()

    with utils.track_progress_parallel(celery_task=celery_task,
                                       name='tar',
                                       progress_fn=lambda: tar_path.stat().st_size,
                                       total=source_size,
                                       units='bytes'):
        # using python to create tar files does not support --sparse
        utils.tar(tar_path=tar_path, source_dir=source_dir)

    # TODO: validate files inside tar
    return tar_path


def upload_file_to_sda(celery_task: WorkflowTask,
                       local_file_path: Path,
                       sda_file_path: str) -> None:
    local_digest = utils.checksum(local_file_path)
    sda_digest = sda.get_hash(sda_file_path, missing_ok=True)
    if sda_digest == local_digest:
        logger.warning(f'{local_file_path} is already on SDA at {sda_file_path} - not uploading')
    else:
        local_file_size = local_file_path.stat().st_size

        with utils.track_progress_parallel(celery_task=celery_task,
                                           name='sda_put',
                                           progress_fn=lambda: sda.get_size(sda_file_path),
                                           total=local_file_size,
                                           units='bytes'):
            sda.put(local_file=str(local_file_path), sda_file=sda_file_path, verify_checksum=True)


def archive(celery_task: WorkflowTask, dataset: dict, delete_local_file: bool = False):
    # Tar the dataset directory and compute checksum
    scratch_tar_path = Path(f'{config["paths"]["scratch"]}/{dataset["name"]}.tar')
    make_tarfile(celery_task=celery_task,
                 tar_path=scratch_tar_path,
                 source_dir=dataset['origin_path'],
                 source_size=dataset['du_size'])

    sda_dir = wf_utils.get_archive_dir(dataset['type'])
    sda_tar_path = f'{sda_dir}/{scratch_tar_path.name}'
    upload_file_to_sda(celery_task=celery_task,
                       local_file_path=scratch_tar_path,
                       sda_file_path=sda_tar_path)
    if delete_local_file:
        # file successfully uploaded to SDA, delete the local copy
        scratch_tar_path.unlink()

    return sda_tar_path


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('archive_dataset'))
def archive_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    sda_tar_path = archive(celery_task, dataset)
    update_data = {
        'archive_path': sda_tar_path
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='ARCHIVED')

    return dataset_id,

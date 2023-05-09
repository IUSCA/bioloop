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


def make_tarfile(celery_task: WorkflowTask, tar_path: Path, source_dir: str, source_size: int):
    print(f'creating tar of {source_dir} at {tar_path}')
    # if the tar file already exists, delete it
    if tar_path.exists():
        tar_path.unlink()

    with utils.track_progress_parallel(progress_fn=utils.file_progress,
                                       progress_fn_args=(celery_task, tar_path, source_size, 'tar')):
        with tarfile.open(tar_path, 'w') as tar:
            tar.add(str(source_dir), arcname=tar_path.name, recursive=True)

    # TODO: validate files inside tar
    return tar_path


def hsi_put_progress(celery_task: WorkflowTask, sda_path: str, total_size: int):
    size = sda.get_size(sda_path)
    name = 'sda_put'
    r = utils.progress(name=name, done=size, total=total_size)
    celery_task.update_progress(r)


def upload_file_to_sda(celery_task: WorkflowTask,
                       local_file_path: Path,
                       sda_file_path: str,
                       delete_local_file=True) -> None:
    # local_digest = utils.checksum(local_file_path)
    local_file_size = local_file_path.stat().st_size

    print('sda put', str(local_file_path), sda_file_path)
    with utils.track_progress_parallel(progress_fn=hsi_put_progress,
                                       progress_fn_args=(celery_task, sda_file_path, local_file_size)):
        sda.put(local_file=str(local_file_path), sda_file=sda_file_path, verify_checksum=True)

    # validate whether the md5 checksums of local and SDA copies match
    # sda_digest = sda.get_hash(sda_file_path)
    # if sda_digest == local_digest:
    #     if delete_local_file:
    #         # file successfully uploaded to SDA, delete the local copy
    #         local_file_path.unlink()
    # else:
    #     raise Exception(
    #         f'Archive failed: Checksums of local {local_file_path} ({local_digest})' +
    #         f'and SDA {sda_file_path} ({sda_digest}) do not match')


def archive(celery_task: WorkflowTask, dataset: dict):
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

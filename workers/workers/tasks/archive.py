import tarfile
from pathlib import Path

from celery import Celery
from sca_rhythm import WorkflowTask

import workers.api as api
import workers.config.celeryconfig as celeryconfig
import workers.sda as sda
import workers.utils as utils
import workers.workflow_utils as wf_utils
from workers.config.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)


def make_tarfile(celery_task, tarfile_name, source_dir, source_size):
    tar_path = Path(f'{config["paths"]["scratch"]}/{tarfile_name}.tar')

    print(f'creating tar of {source_dir} at {tar_path}')
    # if the tar file already exists, delete it
    if tar_path.exists():
        tar_path.unlink()

    with utils.track_progress_parallel(progress_fn=utils.file_progress,
                                       progress_fn_args=(celery_task, tar_path, source_size, 'tar')):
        with tarfile.open(tar_path, 'w') as tar:
            tar.add(str(source_dir), arcname=tarfile_name, recursive=True)
    return tar_path


def hsi_put_progress(celery_task, sda_path, total_size):
    size = sda.get_size(sda_path)
    name = 'sda_put'
    r = utils.progress(name=name, done=size, total=total_size)
    celery_task.update_progress(r)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('archive_dataset'))
def archive_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    # Tar the dataset directory and compute checksum
    scratch_tar_path = make_tarfile(celery_task=celery_task,
                                    tarfile_name=dataset['name'],
                                    source_dir=dataset['origin_path'],
                                    source_size=dataset['du_size'])
    scratch_digest = utils.checksum(scratch_tar_path)

    dataset_type = dataset['type'].lower()
    sda_dir = config["paths"][dataset_type]["archive"]
    sda.ensure_directory(sda_dir)  # create the directory if it does not exist

    sda_tar_path = f'{sda_dir}/{dataset["name"]}.tar'

    print('sda put', str(scratch_tar_path), sda_tar_path)
    with utils.track_progress_parallel(progress_fn=hsi_put_progress,
                                       progress_fn_args=(celery_task, sda_tar_path, dataset['du_size'])):
        sda.put(source=scratch_tar_path, target=sda_tar_path)

    # validate whether the md5 checksums of local and SDA copies match
    sda_digest = sda.get_hash(sda_tar_path)
    if sda_digest == scratch_digest:
        # file successfully uploaded to SDA, delete the local copy
        scratch_tar_path.unlink()
    else:
        raise Exception(
            f'Archive failed: Checksums of local {scratch_tar_path} ({scratch_digest})' +
            'and SDA {sda_tar_path} ({sda_digest}) do not match')

    update_data = {
        'archive_path': sda_tar_path
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='ARCHIVED')

    return dataset_id,

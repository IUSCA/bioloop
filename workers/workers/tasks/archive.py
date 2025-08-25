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
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def make_tarfile(celery_task: WorkflowTask, tar_path: Path, source_dir: str, source_size: int):
    """

    @param celery_task:
    @param tar_path:
    @param source_dir:
    @param source_size:
    @return:
    """
    logger.info(f'creating tar of {source_dir} at {tar_path}')
    # if the tar file already exists, delete it
    if tar_path.exists():
        tar_path.unlink()

    with wf_utils.track_progress_parallel(celery_task=celery_task,
                                          name='tar',
                                          progress_fn=lambda: tar_path.stat().st_size,
                                          total=source_size,
                                          units='bytes'):
        # using python to create tar files does not support --sparse
        # SDA has trouble uploading sparse tar files
        cmd.tar(tar_path=tar_path, source_dir=source_dir)

    # TODO: validate files inside tar
    return tar_path


def archive(celery_task: WorkflowTask, dataset: dict, delete_local_file: bool = False):
    # Tar the dataset directory and compute checksum
    bundle = Path(f'{config["paths"][dataset["type"]]["bundle"]["generate"]}/{dataset["name"]}.tar')

    make_tarfile(celery_task=celery_task,
                 tar_path=bundle,
                 source_dir=dataset['origin_path'],
                 source_size=dataset['du_size'])

    bundle_size = bundle.stat().st_size
    bundle_checksum = utils.checksum(bundle)
    bundle_attrs = {
        'name': bundle.name,
        'size': bundle_size,
        'md5': bundle_checksum,
    }

    # Use local archive directory instead of SDA
    local_archive_dir = Path(f'/opt/sca/data/archive/{dataset["type"].lower()}')
    local_archive_dir.mkdir(parents=True, exist_ok=True)
    
    local_archive_path = local_archive_dir / bundle.name
    
    # Copy the bundle to the local archive location
    logger.info(f'Copying bundle {bundle} to local archive at {local_archive_path}')
    shutil.copy2(bundle, local_archive_path)
    
    # Verify the copy was successful
    if not local_archive_path.exists():
        raise Exception(f'Failed to copy bundle to local archive: {local_archive_path}')
    
    # Verify checksum of archived file
    archived_checksum = utils.checksum(local_archive_path)
    if archived_checksum != bundle_checksum:
        raise Exception(f'Checksum mismatch after archiving. Original: {bundle_checksum}, Archived: {archived_checksum}')
    
    logger.info(f'Successfully archived bundle to local storage: {local_archive_path}')

    if delete_local_file:
        # file successfully archived locally, delete the local copy
        logger.info("Deleting local bundle after successful archiving")
        bundle.unlink()

    return str(local_archive_path), bundle_attrs


def archive_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    sda_bundle_path, bundle_attrs = archive(celery_task, dataset)
    update_data = {
        'archive_path': sda_bundle_path,
        'bundle': bundle_attrs
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='ARCHIVED')

    return dataset_id,

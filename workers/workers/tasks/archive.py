import json
import shutil
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask

import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
import workers.workflow_utils as wf_utils
from workers import storage
from workers.config import config
from workers.dataset import (get_archive_bundle_name, get_archive_key,
                             get_archive_path, get_bundle_generate_path)

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
    # The local tar is named for the dataset id and the tape object for the dataset name.
    # They are deliberately different: nobody reads the local file, and two groups may hold
    # the same dataset name.
    bundle = Path(get_bundle_generate_path(dataset))
    bundle.parent.mkdir(parents=True, exist_ok=True)

    make_tarfile(celery_task=celery_task,
                 tar_path=bundle,
                 source_dir=dataset['origin_path'],
                 source_size=dataset['du_size'])

    bundle_size = bundle.stat().st_size
    bundle_checksum = utils.checksum(bundle)
    bundle_attrs = {
        'name': get_archive_bundle_name(dataset),
        'size': bundle_size,
        'md5': bundle_checksum,
    }

    # get_archive_dir creates the per-type directory; the group directory below it is ours.
    archive_key = get_archive_key(dataset)
    dataset_type_archive_dir = wf_utils.get_archive_dir(dataset['type'])
    storage.ensure_directory(f'{dataset_type_archive_dir}/{archive_key}')

    dataset_bundle_path = get_archive_path(dataset)

    wf_utils.archive(local_file_path=bundle,
                      archive_path=dataset_bundle_path,
                      celery_task=celery_task)

    if delete_local_file:
        # file successfully uploaded to SDA, delete the local copy
        print("deleting local bundle")
        bundle.unlink()

    return dataset_bundle_path, bundle_attrs, archive_key


def archive_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    archived_bundle_path, bundle_attrs, archive_key = archive(celery_task, dataset)
    # archive_group_key records who owned the dataset when the bundle was written. The owner
    # can change afterwards; the tape object does not move.
    # @see docs/design/groups/dataset-storage.md — Archival
    update_data = {
        'archive_path': archived_bundle_path,
        'archive_group_key': archive_key,
        'bundle': bundle_attrs
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='ARCHIVED')

    return dataset_id,

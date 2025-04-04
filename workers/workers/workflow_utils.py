from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from pathlib import Path

# import multiprocessing
# https://stackoverflow.com/questions/30624290/celery-daemonic-processes-are-not-allowed-to-have-children
import billiard as multiprocessing
from sca_rhythm import WorkflowTask
from sca_rhythm.progress import Progress

from workers import utils
from workers.config import config
from workers.services.storage import storage

logger = logging.getLogger(__name__)


# def make_task_name(task_name):
#     app_id = config['app_id']
#     return f'{app_id}.{task_name}'


def get_wf_body(wf_name: str) -> dict:
    wf_body = config['workflow_registry'][wf_name]
    wf_body['name'] = wf_body.get('name', wf_name)
    wf_body['app_id'] = config['app_id']
    for step in wf_body['steps']:
        if 'queue' not in step:
            step['queue'] = f'{config["app_id"]}.q'
    return wf_body


def get_archive_dir(dataset_type: str) -> str:
    archive_dir = config["paths"][dataset_type]["archive"]
    storage.ensure_directory(archive_dir)  # create the directory if it does not exist
    return archive_dir


@contextmanager
def track_progress_parallel(celery_task: WorkflowTask,
                            name: str,
                            progress_fn,
                            total: int = None,
                            units: str = None,
                            loop_delay=5):
    def progress_loop():
        prog = Progress(celery_task=celery_task, name=name, total=total, units=units)
        while True:
            time.sleep(loop_delay)
            try:
                done = progress_fn()
                prog.update(done)
            except Exception as e:
                # log the exception message without stacktrace
                logger.debug('exception in parallel progress loop: %s', e)

    p = None
    try:
        # start a subprocess to call progress_loop every loop_delay seconds
        p = multiprocessing.Process(target=progress_loop)
        p.start()
        logger.debug(f'starting a sub process to track progress with pid: {p.pid}')
        yield p  # inside the context manager
    finally:
        # terminate the sub process
        logger.debug(f'terminating progress tracker: {p.pid}')
        if p is not None:
            p.terminate()


def upload_file_to_storage(local_file_path: Path,
                           archive_file_path: str,
                           *,
                           celery_task: WorkflowTask = None,
                           verify_checksum: bool = True,
                           preflight_check: bool = True) -> None:
    """

    @param local_file_path:
    @param archive_file_path:
    @param celery_task:
    @param verify_checksum:
    @param preflight_check:
    """
    local_digest = None
    archive_digest = None

    if preflight_check:
        archive_digest = storage.get_hash(archive_file_path, missing_ok=True)
        if archive_digest is not None:
            logger.info(f'computing checksum of local file {local_file_path} to compare with archive_digest')
            local_digest = utils.checksum(local_file_path)

    if archive_digest is not None and local_digest is not None and archive_digest == local_digest:
        logger.warning(
            f'The checksums of local file {local_file_path} and Archive file {archive_file_path} match - not '
            f'uploading')
    else:
        if celery_task is not None:
            local_file_size = local_file_path.stat().st_size
            cm = track_progress_parallel(celery_task=celery_task,
                                         name='archive put',
                                         progress_fn=lambda: storage.get_size(archive_file_path),
                                         total=local_file_size,
                                         units='bytes')
        else:
            cm = utils.empty_context_manager()
        with cm:
            logging.info(f'putting {local_file_path} on Archive at {archive_file_path}')
            storage.put(local_file=str(local_file_path),
                        storage_file=archive_file_path,
                        verify_checksum=verify_checksum)


def download_file_from_archive(archive_file_path: str,
                               local_file_path: Path,
                               *,
                               celery_task: WorkflowTask = None,
                               verify_checksum: bool = True,
                               preflight_check: bool = False) -> None:
    """
    Before downloading, check if the file exists and the checksums match.
    If not, download from Archive and validate if the checksums match.
    @param archive_file_path:
    @param local_file_path:
    @param celery_task:
    @param verify_checksum:
    @param preflight_check:
    """
    file_exists = False

    if preflight_check:
        archive_digest = storage.get_hash(storage_file=archive_file_path)
        if local_file_path.exists() and local_file_path.is_file():
            # if local file exists, validate checksum against Archive
            logger.info(f'computing checksum of local file {local_file_path}')
            local_digest = utils.checksum(local_file_path)
            if archive_digest == local_digest:
                file_exists = True
                logger.warning(f'local file exists and the checksums match - not getting from the Archive')

    if not file_exists:
        logger.info('getting file from Archive')

        # delete the local file if possible
        local_file_path.unlink(missing_ok=True)

        if celery_task is not None:
            source_size = storage.get_size(archive_file_path)
            cm = track_progress_parallel(celery_task=celery_task,
                                         name='archive get',
                                         progress_fn=lambda: local_file_path.stat().st_size,
                                         total=source_size,
                                         units='bytes')
        else:
            cm = utils.empty_context_manager()
        with cm:
            logger.info(f'getting file from Archive {archive_file_path} to {local_file_path}')
            storage.get(storage_file=archive_file_path, local_file=str(local_file_path),
                        verify_checksum=verify_checksum)

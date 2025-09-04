from __future__ import annotations

import logging
import time
import shutil
from contextlib import contextmanager
from pathlib import Path

# import multiprocessing
# https://stackoverflow.com/questions/30624290/celery-daemonic-processes-are-not-allowed-to-have-children
import billiard as multiprocessing
from sca_rhythm import WorkflowTask
from sca_rhythm.progress import Progress

from workers import sda, utils
from workers.config import config

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
    sda_dir = config["paths"][dataset_type]["archive"]
    # sda.ensure_directory(sda_dir)  # create the directory if it does not exist
    return sda_dir


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
                logger.warning('exception in parallel progress loop: %s', e)

    p = None
    try:
        # start a subprocess to call progress_loop every loop_delay seconds
        p = multiprocessing.Process(target=progress_loop)
        p.start()
        logger.info(f'starting a sub process to track progress with pid: {p.pid}')
        yield p  # inside the context manager
    finally:
        # terminate the sub process
        logger.info(f'terminating progress tracker: {p.pid}')
        if p is not None:
            p.terminate()


def upload_file_to_sda(local_file_path: Path,
                       sda_file_path: str,
                       *,
                       celery_task: WorkflowTask = None,
                       verify_checksum: bool = True,
                       preflight_check: bool = True) -> None:
    """
    Copy directory from local_file_path to sda_file_path.
    
    @param local_file_path: Local directory path to copy from
    @param sda_file_path: SDA directory path to copy to
    @param celery_task: Celery task for progress tracking (unused in simplified version)
    @param verify_checksum: Whether to verify checksum (unused in simplified version)
    @param preflight_check: Whether to perform preflight checks (unused in simplified version)
    """
    logger.info(f'upload_file_to_sda: copying from {local_file_path} to {sda_file_path}')
    
    # Ensure the destination directory exists
    sda_path = Path(sda_file_path)
    sda_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Remove destination if it exists (whether file or directory)
    if sda_path.exists():
        if sda_path.is_dir():
            shutil.rmtree(sda_path)
        else:
            sda_path.unlink()
    
    # Copy the file/directory contents
    if local_file_path.is_dir():
        shutil.copytree(local_file_path, sda_file_path, dirs_exist_ok=True)
    else:
        shutil.copy2(local_file_path, sda_file_path)
    
    logger.info(f'upload_file_to_sda: successfully copied to {sda_file_path}')


def download_file_from_sda(sda_file_path: str,
                           local_file_path: Path,
                           *,
                           celery_task: WorkflowTask = None,
                           verify_checksum: bool = True,
                           preflight_check: bool = False) -> None:
    """
    Copy directory from sda_file_path to local_file_path.
    
    @param sda_file_path: SDA directory path to copy from
    @param local_file_path: Local directory path to copy to
    @param celery_task: Celery task for progress tracking (unused in simplified version)
    @param verify_checksum: Whether to verify checksum (unused in simplified version)
    @param preflight_check: Whether to perform preflight checks (unused in simplified version)
    """
    logger.info(f'copying directory from {sda_file_path} to {local_file_path}')
    
    # Ensure the destination directory exists
    local_path = Path(local_file_path)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Copy the directory contents
    sda_path = Path(sda_file_path)
    if sda_path.is_dir():
        shutil.copytree(sda_file_path, local_file_path, dirs_exist_ok=True)
    else:
        # If it's a file, copy it directly
        shutil.copy2(sda_file_path, local_file_path)
    
    logger.info(f'successfully copied from {sda_file_path} to {local_file_path}')

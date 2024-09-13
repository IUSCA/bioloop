from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from pathlib import Path
import shutil
import tarfile
import tempfile
import os

# import multiprocessing
# https://stackoverflow.com/questions/30624290/celery-daemonic-processes-are-not-allowed-to-have-children
import billiard as multiprocessing
from sca_rhythm import WorkflowTask
from sca_rhythm.progress import Progress
from workers import sda, utils
from workers.config import config
import workers.exceptions as exc
import workers.cmd as cmd


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
    sda.ensure_directory(sda_dir)  # create the directory if it does not exist
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

    @param local_file_path:
    @param sda_file_path:
    @param celery_task:
    @param verify_checksum:
    @param preflight_check:
    """
    local_digest = None
    sda_digest = None

    if preflight_check:
        sda_digest = sda.get_hash(sda_file_path, missing_ok=True)
        if sda_digest is not None:
            logger.info(f'computing checksum of local file {local_file_path} to compare with sda_digest')
            local_digest = utils.checksum(local_file_path)

    if sda_digest is not None and local_digest is not None and sda_digest == local_digest:
        logger.warning(f'The checksums of local file {local_file_path} and SDA file {sda_file_path} match - not '
                       f'uploading')
    else:
        if celery_task is not None:
            local_file_size = local_file_path.stat().st_size
            cm = track_progress_parallel(celery_task=celery_task,
                                         name='sda put',
                                         progress_fn=lambda: sda.get_size(sda_file_path),
                                         total=local_file_size,
                                         units='bytes')
        else:
            cm = utils.empty_context_manager()
        with cm:
            logging.info(f'putting {local_file_path} on SDA at {sda_file_path}')
            sda.put(local_file=str(local_file_path), sda_file=sda_file_path, verify_checksum=verify_checksum)


def download_file_from_sda(sda_file_path: str,
                           local_file_path: Path,
                           *,
                           celery_task: WorkflowTask = None,
                           verify_checksum: bool = True,
                           preflight_check: bool = True) -> None:
    """
    Before downloading, check if the file exists and the checksums match.
    If not, download from SDA and validate if the checksums match.
    @param sda_file_path:
    @param local_file_path:
    @param celery_task:
    @param verify_checksum:
    @param preflight_check:
    """
    file_exists = False

    if preflight_check:
        sda_digest = sda.get_hash(sda_path=sda_file_path)
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

        if celery_task is not None:
            source_size = sda.get_size(sda_file_path)
            cm = track_progress_parallel(celery_task=celery_task,
                                         name='sda get',
                                         progress_fn=lambda: local_file_path.stat().st_size,
                                         total=source_size,
                                         units='bytes')
        else:
            cm = utils.empty_context_manager()
        with cm:
            logger.info(f'getting file from SDA {sda_file_path} to {local_file_path}')
            sda.get(sda_file=sda_file_path, local_file=str(local_file_path), verify_checksum=verify_checksum)


def extract_tarfile(tar_path: Path, target_dir: Path, override_arcname=False):
    """
    tar_path: path to the tar file to extract
    target_dir: path to the top level directory after extraction

    extracts the tar file to  target_dir.parent directory.

    The directory created here after extraction will have the same name as the top level directory inside the archive.

    If that is not desired and the name of the directory created needs to be the same as target_dir.name,
    then set override_arcname = True

    If a directory with the same name as extracted dir already exists, it will be deleted.
    @param tar_path:
    @param target_dir:
    @param override_arcname:
    """
    with tarfile.open(tar_path, mode='r') as archive:
        # find the top-level directory in the extracted archive
        archive_name = os.path.commonprefix(archive.getnames())
        logger.info(f'extract_tarfile: archive_name: {archive_name}')
        
        extraction_dir = target_dir if override_arcname else (target_dir.parent / archive_name)

        # if extraction_dir exists then delete it
        if extraction_dir.exists():
            logger.info(f'extract_tarfile: deleting existing extraction directory {str(extraction_dir)}')
            shutil.rmtree(extraction_dir)
        else:
            logger.info(f'extract_tarfile: extraction directory {str(extraction_dir)} does not exist')

        # create parent directories if missing
        extraction_dir.parent.mkdir(parents=True, exist_ok=True)

        # extracts the tar contents to a temp directory
        # move the contents to the extraction_dir
        with tempfile.TemporaryDirectory(dir=extraction_dir.parent) as tmp_dir:
            archive.extractall(path=tmp_dir)
            shutil.move(Path(tmp_dir) / archive_name, extraction_dir)


def make_tarfile(celery_task: WorkflowTask, tar_path: Path, source_dir: str, source_size: int):
    """

    @param celery_task:
    @param tar_path:
    @param source_dir:
    @param source_size:
    @return:
    """
    print(f'creating tar of {source_dir} at {tar_path}')
    # if the tar file already exists, delete it
    if tar_path.exists():
        tar_path.unlink()

    with track_progress_parallel(celery_task=celery_task,
                                          name='tar',
                                          progress_fn=lambda: tar_path.stat().st_size,
                                          total=source_size,
                                          units='bytes'):
        # using python to create tar files does not support --sparse
        # SDA has trouble uploading sparse tar files
        cmd.tar(tar_path=tar_path, source_dir=source_dir)

    # TODO: validate files inside tar
    return tar_path


def generate_metadata(celery_task, source: Path):
    """
    source is a directory that exists and has to readable and executable (see files inside)
    all the files and directories under source should be readable
    returns:    number of files, 
                number of directories, 
                sum of stat size of all files, 
                number of genome data files,
                the md5 digest and relative filenames of genome data files
    """
    num_files, num_directories, size, num_genome_files = 0, 0, 0, 0
    metadata = []
    errors = []
    if not utils.is_readable(source):
        msg = f'source {source} is either not readable or not traversable'
        raise exc.InspectionFailed(msg)

    paths = list(source.rglob('*'))
    progress = Progress(celery_task=celery_task, name='', units='items')

    for p in progress(paths):
        if utils.is_readable(p):
            if p.is_file():
                num_files += 1
                # if symlink, only add the size of the symlink, not the pointed file
                file_size = p.lstat().st_size
                size += file_size
                # do not compute checksum for symlinks
                hex_digest = utils.checksum(p) if not p.is_symlink() else None
                relpath = p.relative_to(source)
                metadata.append({
                    'path': str(relpath),
                    'md5': hex_digest,
                    'size': file_size,
                    'type': utils.filetype(p)
                })
                if ''.join(p.suffixes) in config['genome_file_types'] and not p.is_symlink():
                    num_genome_files += 1
            elif p.is_dir():
                num_directories += 1
        else:
            errors.append(f'{p} is not readable/traversable')

    if len(errors) > 0:
        raise exc.InspectionFailed(errors)

    return num_files, num_directories, size, num_genome_files, metadata

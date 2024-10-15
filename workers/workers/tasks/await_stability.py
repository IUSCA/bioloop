import datetime
import itertools
import time
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config

logger = get_task_logger(__name__)

app = Celery("tasks")
app.config_from_object(celeryconfig)


def dir_last_modified_time(dataset_path: Path) -> float:
    """
    Obtain the most recent modification time for a directory and all its contents in a recursive manner.
    At times, when copying files, outdated modification times may be retained.
    To address this, monitor the modification time of the root directory as well.

    If the copy process is configured to preserve the metadata of the source file, it will update the m_time
    of the target file after the copy process. This will update the c_time of the target file. In these cases,
    c_time will be bigger than m_time. So, we will consider the maximum of c_time and m_time of the file / directory 
    as the last modified time.


    Args:
    dataset_path (Path): Path object to the directory.

    Returns:
    float: The last modified time in epoch seconds.
    """
    paths = itertools.chain([dataset_path], dataset_path.rglob('*'))
    return max(
        (max(p.lstat().st_mtime, p.lstat().st_ctime) for p in paths if p.exists()),
        default=time.time()
    )


def update_progress(celery_task, mod_time, delta):
    d1 = datetime.datetime.utcfromtimestamp(mod_time)
    prog_obj = {
        'name': d1.isoformat(),
        'time_remaining_sec': config['registration']['recency_threshold_seconds'] - delta,
    }
    celery_task.update_progress(prog_obj)


def await_stability(celery_task, dataset_id, wait_seconds: int = None, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    origin_path = Path(dataset['origin_path'])

    while origin_path.exists():
        mod_time = dir_last_modified_time(origin_path)
        delta = time.time() - mod_time

        logger.info(f'{dataset["name"]} dataset is last modified {int(delta)}s ago')
        update_progress(celery_task, mod_time, delta)

        if delta > config['registration']['recency_threshold_seconds']:
            break

        time.sleep(wait_seconds or config['registration']['wait_between_stability_checks_seconds'])

    api.add_state_to_dataset(dataset_id=dataset_id, state='READY')
    return dataset_id,

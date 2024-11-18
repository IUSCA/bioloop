import datetime
import time
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.dataset import is_dataset_locked_for_writes
from workers.utils import dir_last_modified_time

logger = get_task_logger(__name__)

app = Celery("tasks")
app.config_from_object(celeryconfig)


def update_progress(celery_task, mod_time, delta):
    d1 = datetime.datetime.utcfromtimestamp(mod_time)
    prog_obj = {
        'name': d1.isoformat(),
        'time_remaining_sec': config['registration']['recency_threshold_seconds'] - delta,
    }
    celery_task.update_progress(prog_obj)


def await_stability(celery_task, dataset_id, wait_seconds: int = None, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)

    locked, latest_state = is_dataset_locked_for_writes(dataset)
    if locked:
        raise Exception(f"Dataset {dataset['id']} is locked for writes. Dataset's current "
                        f"state is {latest_state}.")

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

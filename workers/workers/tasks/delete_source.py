import shutil
from pathlib import Path

from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.dataset import is_dataset_locked_for_writes


app = Celery("tasks")
app.config_from_object(celeryconfig)


def delete_source(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)

    locked, latest_state = is_dataset_locked_for_writes(dataset)
    if locked:
        raise Exception(f"Dataset {dataset['id']} is locked for writes. Dataset's current "
                        f"state is {latest_state}.")

    origin_path = Path(dataset['origin_path']).resolve()

    if origin_path.exists():
        shutil.rmtree(origin_path)

    return dataset_id,

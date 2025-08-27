import shutil
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def delete_source(celery_task, dataset_id, launch_wf: bool = True, **kwargs):
    if not launch_wf:
        logger.info(f"launch_wf is False. Skipping workflow launch for dataset {dataset_id}")
        return dataset_id,

    dataset = api.get_dataset(dataset_id=dataset_id)
    origin_path = Path(dataset['origin_path']).resolve()

    if origin_path.exists():
        shutil.rmtree(origin_path)

    return dataset_id,

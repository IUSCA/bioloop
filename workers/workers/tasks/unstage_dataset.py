from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def un_stage_dataset(celery_task, dataset_id, **kwargs):
    payload = {
        'is_staged': False,
    }

    dataset = api.get_dataset(dataset_id=dataset_id)
    if dataset['is_staged']:
        api.update_dataset(dataset_id=dataset_id, update_data=payload)

    print(f"Un-staged dataset {dataset_id}")

    api.add_state_to_dataset(dataset_id=dataset_id, state='READY')

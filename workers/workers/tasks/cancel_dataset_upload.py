import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger

from workers.config import config
import workers.config.celeryconfig as celeryconfig
import workers.api as api

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def purge_uploaded_resources(celery_task, dataset_id, **kwargs):
    print(f"Purging uploaded resources for dataset {dataset_id}")

    dataset = api.get_dataset(dataset_id=dataset_id)

    dataset_path = Path(config['paths'][dataset['type']]['upload']) / str(dataset_id)
    if dataset_path.exists():
        print(f"Found dataset {dataset_id}'s uploaded resources at: {dataset_path}")
        shutil.rmtree(dataset_path)
        print(f"Deleted dataset {dataset_id}'s uploaded resources")
    else:
        print(f"No uploaded resources found for dataset {dataset_id} at: {dataset_path}")

    print(f"Will delete dataset {dataset_id}'s upload records")
    api.delete_dataset_upload_log(uploaded_dataset_id=dataset_id)

    return dataset_id,
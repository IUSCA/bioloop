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
    dataset_path = Path(config['paths']['DATA_PRODUCT']['upload']) / str(dataset_id)
    if dataset_path.exists():
        shutil.rmtree(dataset_path)

    api.delete_dataset_upload_log(uploaded_dataset_id=dataset_id)

    return dataset_id,
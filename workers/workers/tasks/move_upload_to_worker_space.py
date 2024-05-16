import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger

from workers.config import config
import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def move(celery_task, dataset_id, **kwargs):
    uploaded_chunks_path = Path(f"{config['paths']['DATA_PRODUCT']['upload']}")
    upload_destination_path = Path(f"{config['paths']['DATA_PRODUCT']['upload_destination']}")

    uploaded_chunks_path.rename(upload_destination_path)

    shutil.rmtree(uploaded_chunks_path)

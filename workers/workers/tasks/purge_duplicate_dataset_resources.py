from __future__ import annotations  # type unions by | are only available in versions >= 3

from pathlib import Path
import shutil

from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
from workers.config import config
import workers.config.celeryconfig as celeryconfig
from workers.exceptions import InspectionFailed

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def purge(celery_task, duplicate_dataset_id, **kwargs):
    logger.info(f"Purging for duplicate dataset {duplicate_dataset_id}")

    incoming_duplicate_dataset = api.get_dataset(dataset_id=duplicate_dataset_id,
                                                 include_duplications=True)

    if not incoming_duplicate_dataset['is_duplicate']:
        raise InspectionFailed(f"Dataset {duplicate_dataset_id} is not a duplicate")

    rejected_dataset_latest_state = incoming_duplicate_dataset['states'][0]['state']
    if rejected_dataset_latest_state != config['DATASET_STATES']['DUPLICATE_REJECTED']:
        raise InspectionFailed(f"Expected dataset {incoming_duplicate_dataset['id']} to be in state "
                               f"{config['DATASET_STATES']['DUPLICATE_REJECTED']}, but current state is "
                               f"{rejected_dataset_latest_state}.")

    duplicate_dataset_origin_path = Path(incoming_duplicate_dataset['origin_path']).resolve() if \
        incoming_duplicate_dataset['origin_path'] is not None else None

    if (duplicate_dataset_origin_path is not None and
            duplicate_dataset_origin_path.exists()):
        shutil.rmtree(duplicate_dataset_origin_path)

    return duplicate_dataset_id,

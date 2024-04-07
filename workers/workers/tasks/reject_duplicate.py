from __future__ import annotations  # type unions by | are only available in versions >= 3

import shutil
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.exceptions import InspectionFailed

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


# Handles the acceptance of an incoming duplicate dataset, by updating the `type`
# of the incoming duplicate to match the original dataset's `type`, and removing the
# original dataset from the database and the filesystem.
def reject(celery_task, duplicate_dataset_id, **kwargs):
    duplicate_dataset = api.get_dataset(
        dataset_id=duplicate_dataset_id,
    )

    if not duplicate_dataset['is_duplicate']:
        raise InspectionFailed(f"Dataset {duplicate_dataset['id']} is not a duplicate")
    if duplicate_dataset['is_deleted']:
        raise InspectionFailed(f"Dataset {duplicate_dataset['id']} is deleted")

    duplicate_dataset_latest_state = duplicate_dataset['states'][0]['state']

    # allow step to be resumed after even if it has already reached the next
    # state (DUPLICATE_REJECTED)
    if (duplicate_dataset_latest_state != config['DATASET_STATES']['DUPLICATE_DATASET_RESOURCES_PURGED'] and
            duplicate_dataset_latest_state != config['DATASET_STATES']['DUPLICATE_REJECTED']):
        raise InspectionFailed(f"Expected dataset {duplicate_dataset['id']} to be in one of "
                               f"states {config['DATASET_STATES']['DUPLICATE_REJECTED']} or {config['DATASET_STATES']['DUPLICATE_DATASET_RESOURCES_PURGED']}, "
                               f"but current state is {duplicate_dataset_latest_state}.")

    api.complete_duplicate_dataset_rejection(duplicate_dataset_id=duplicate_dataset_id)

    return duplicate_dataset_id,


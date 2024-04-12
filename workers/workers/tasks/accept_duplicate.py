from __future__ import annotations  # type unions by | are only available in versions >= 3

from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.exceptions import InspectionFailed

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def accept(celery_task, duplicate_dataset_id, **kwargs):
    duplicate_being_accepted = api.get_dataset(
        dataset_id=duplicate_dataset_id,
        include_duplications=True
    )

    if not duplicate_being_accepted['is_duplicate']:
        raise InspectionFailed(f"Dataset {duplicate_being_accepted['id']} is not a duplicate")
    if duplicate_being_accepted['is_deleted']:
        raise InspectionFailed(f"Dataset {duplicate_being_accepted['id']} is deleted")

    original_dataset = api.get_dataset(
        dataset_id=duplicate_being_accepted['duplicated_from']['original_dataset_id'],
    )

    duplicate_dataset_latest_state = duplicate_being_accepted['states'][0]['state']
    if (duplicate_dataset_latest_state != config['DATASET_STATES']['DUPLICATE_ACCEPTANCE_IN_PROGRESS']
            and duplicate_dataset_latest_state != config['DATASET_STATES']['DUPLICATE_ACCEPTED']):
        raise InspectionFailed(f"Expected duplicate dataset {duplicate_dataset_id} to be in "
                               f"one of states {config['DATASET_STATES']['DUPLICATE_ACCEPTANCE_IN_PROGRESS']} or "
                               f"{config['DATASET_STATES']['DUPLICATE_ACCEPTED']}, but current "
                               f"state is {duplicate_dataset_latest_state}.")

    original_dataset_latest_state = original_dataset['states'][0]['state']
    if (original_dataset_latest_state != config['DATASET_STATES']['ORIGINAL_DATASET_RESOURCES_PURGED']
            and original_dataset_latest_state != config['DATASET_STATES']['OVERWRITTEN']):
        raise InspectionFailed(f"Expected original dataset {original_dataset['id']} to be in "
                               f"one of states {config['DATASET_STATES']['ORIGINAL_DATASET_RESOURCES_PURGED']} or {config['DATASET_STATES']['OVERWRITTEN']}, but current "
                               f"state is {original_dataset_latest_state}.")

    api.complete_duplicate_dataset_acceptance(duplicate_dataset_id=duplicate_dataset_id)

    return duplicate_being_accepted['id'],


from __future__ import annotations  # type unions by | are only available in versions >= 3

import json
import itertools
import hashlib
import shutil
from pathlib import Path
import time

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm.progress import Progress

import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
from workers.exceptions import InspectionFailed
from workers import exceptions as exc
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


# Handles the acceptance of an incoming duplicate dataset, by updating the `type`
# of the incoming duplicate to match the original dataset's `type`, and removing the
# original dataset from the database and the filesystem.
def accept(celery_task, duplicate_dataset_id, **kwargs):
    duplicate_being_accepted = api.get_dataset(
        dataset_id=duplicate_dataset_id,
        include_duplications=True
    )
    original_dataset = api.get_dataset(
        dataset_id=duplicate_being_accepted['duplicated_from']['original_dataset_id'],
    )

    original_dataset_latest_state = original_dataset['states'][0]['state']

    if (original_dataset_latest_state != 'RESOURCES_PURGED'
            and original_dataset_latest_state != 'OVERWRITTEN'):
        raise InspectionFailed(f"Expected original dataset {original_dataset['id']} to be in "
                               f"one of states RESOURCES_PURGED or OVERWRITTEN, but current "
                               f"state is {original_dataset_latest_state}.")

    api.complete_duplicate_dataset_acceptance(duplicate_dataset_id=duplicate_dataset_id)

    return duplicate_being_accepted['id'],


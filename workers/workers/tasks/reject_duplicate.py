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
def reject(celery_task, duplicate_dataset_id, **kwargs):
    duplicate_dataset = api.get_dataset(
        dataset_id=duplicate_dataset_id,
    )

    duplicate_dataset_latest_state = duplicate_dataset['states'][0]['state']

    if duplicate_dataset_latest_state != 'RESOURCES_PURGED':
        raise InspectionFailed(f"Expected dataset {duplicate_dataset['id']} to be in state "
                               f"RESOURCES_PURGED, but current state is "
                               f"{duplicate_dataset_latest_state}.")

    api.complete_duplicate_dataset_rejection(duplicate_dataset_id=duplicate_dataset_id)

    return duplicate_dataset_id,


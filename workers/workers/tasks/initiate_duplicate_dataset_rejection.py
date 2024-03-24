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
def initiate(celery_task, duplicate_dataset_id, **kwargs):
    duplicate_being_rejected = api.initiate_duplicate_dataset_rejection(
        duplicate_dataset_id=duplicate_dataset_id,
    )

    logger.info(f"duplicate_being_rejected id: {duplicate_being_rejected['id']}")

    # once the filesystem resources associated with the original dataset have been cleaned up,
    # the original and the duplicate dataset's statues can be updated.

    return duplicate_being_rejected['id'],

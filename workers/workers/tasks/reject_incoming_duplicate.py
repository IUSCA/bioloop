from __future__ import annotations  # type unions by | are only available in versions >= 3

import itertools
import hashlib
import shutil
from pathlib import Path

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


# Handles the rejection of an incoming duplicate dataset, by deleting the
# duplicate dataset from the database.
def handle_rejection(celery_task, duplicate_dataset_id, **kwargs):
    api.delete_dataset(dataset_id=duplicate_dataset_id)
    return duplicate_dataset_id,


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


# Handles the acceptance of an incoming duplicate dataset, by updating the `type`
# of the incoming duplicate to match the original dataset's `type`, and removing the
# original dataset from the database and the filesystem.
def handle_acceptance(celery_task, duplicate_dataset_id, **kwargs):
    incoming_duplicate_dataset = api.get_dataset(dataset_id=duplicate_dataset_id)

    matching_datasets = api.get_all_datasets(name=incoming_duplicate_dataset.name, bundle=True)
    original_dataset = list(filter(lambda d: d['id'] != incoming_duplicate_dataset.id, matching_datasets))[0]

    original_dataset_staged_path = Path(original_dataset['staged_path']).resolve()
    original_dataset_bundle_path = Path(original_dataset['bundle']['path']).resolve()

    accepted_incoming_dataset = api.accept_duplicate_dataset(
        dataset_id=incoming_duplicate_dataset.id,
    )
    # Once original dataset has been removed from the database, remove it
    # from the filesystem (`staged_path` and the corresponding bundle's path).
    if original_dataset_staged_path:
        shutil.rmtree(original_dataset_staged_path)
    if original_dataset_bundle_path:
        shutil.rmtree(original_dataset_bundle_path)

    return accepted_incoming_dataset.id,


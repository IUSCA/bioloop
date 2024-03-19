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
    incoming_duplicate_dataset = api.get_dataset(dataset_id=duplicate_dataset_id)

    if not incoming_duplicate_dataset['is_duplicate']:
        raise InspectionFailed(f"Dataset {incoming_duplicate_dataset['id']} is not a duplicate")

    # assumes states are sorted in descending order by timestamp
    latest_state = incoming_duplicate_dataset['states'][0]['state']
    if latest_state != 'DUPLICATE_READY':
        raise InspectionFailed(f"Dataset {incoming_duplicate_dataset['id']} needs to reach state"
                               f" DUPLICATE_READY before it can be"
                               f" rejected. Current state is {latest_state}.")

    matching_datasets = api.get_all_datasets(
        name=incoming_duplicate_dataset['name'],
        dataset_type=incoming_duplicate_dataset['type'],
        is_duplicate=False,
        deleted=False,
        bundle=True
    )
    if len(matching_datasets) != 1:
        raise InspectionFailed(f"Expected to find one active (not deleted) original {incoming_duplicate_dataset['type']} named {incoming_duplicate_dataset['name']},"
                               f" but found {len(matching_datasets)}.")

    api.reject_incoming_dataset(dataset_id=duplicate_dataset_id)
    return duplicate_dataset_id,


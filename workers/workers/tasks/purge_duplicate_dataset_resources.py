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


def purge(celery_task, duplicate_dataset_id, **kwargs):
    logger.info(f"Purging for duplicate dataset {duplicate_dataset_id}")

    incoming_duplicate_dataset = api.get_dataset(dataset_id=duplicate_dataset_id,
                                                 include_duplications=True)
    matching_datasets = api.get_all_datasets(
        name=incoming_duplicate_dataset['name'],
        dataset_type=incoming_duplicate_dataset['type'],
        is_duplicate=False,
        deleted=False,
    )
    # ensure system is not in an invalid state
    if len(matching_datasets) != 1:
        raise InspectionFailed(f"Expected to find one active (not deleted) original {incoming_duplicate_dataset['type']} named {incoming_duplicate_dataset['name']},"
                               f" but found {len(matching_datasets)}.")

    matching_original_dataset = matching_datasets[0]

    if matching_original_dataset['id'] != incoming_duplicate_dataset['duplicated_from']['original_dataset_id']:
        raise InspectionFailed(f"Expected dataset {duplicate_dataset_id} to have "
                               f"been duplicated from dataset "
                               f"{incoming_duplicate_dataset['duplicated_from']['original_dataset_id']}, "
                               f"but matching dataset has id {matching_original_dataset['id']}.")

    original_dataset = api.get_dataset(dataset_id=matching_original_dataset['id'], bundle=True)

    original_dataset_latest_state = original_dataset['states'][0]['state']
    # check for state RESOURCES_PURGED as well, in case this step failed after
    # the database write that updates the state to RESOURCES_PURGED.
    if (original_dataset_latest_state != 'DUPLICATE_REJECTION_IN_PROGRESS'
            and original_dataset_latest_state != 'RESOURCES_PURGED'):
        raise InspectionFailed(f"Expected dataset {original_dataset['id']} to be in one of states "
                              f"DUPLICATE_REJECTION_IN_PROGRESS or RESOURCES_PURGED, but current state is "
                              f"{original_dataset_latest_state}.")

    duplicate_dataset_origin_path = Path(incoming_duplicate_dataset['origin_path']).resolve() if \
        original_dataset['origin_path'] is not None else None

    # Once original dataset has been removed from the database, remove it
    # from the filesystem (`staged_path` and the corresponding bundle's path).
    if duplicate_dataset_origin_path is not None and duplicate_dataset_origin_path.exists():
        shutil.rmtree(duplicate_dataset_origin_path)

    duplicate_dataset_latest_state = original_dataset['states'][0]['state']
    # in case step is being resumed after this database write
    if duplicate_dataset_latest_state != 'RESOURCES_PURGED':
        api.add_state_to_dataset(dataset_id=duplicate_dataset_id, state='RESOURCES_PURGED')

    return duplicate_dataset_id,
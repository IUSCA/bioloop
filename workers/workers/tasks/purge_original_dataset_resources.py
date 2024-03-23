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
    logger.info(f"Purging dataset {duplicate_dataset_id}")

    incoming_duplicate_dataset = api.get_dataset(dataset_id=duplicate_dataset_id, include_duplications=True)
    matching_datasets = api.get_all_datasets(
        name=incoming_duplicate_dataset['name'],
        dataset_type=incoming_duplicate_dataset['type'],
        is_duplicate=False,
        deleted=False,
        bundle=True,
    )
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
    if original_dataset_latest_state != 'OVERWRITE_IN_PROGRESS':
        raise InspectionFailed(f"Expected dataset {original_dataset['id']} to be in state "
                              f" OVERWRITE_IN_PROGRESS, but current state is "
                              f"{original_dataset_latest_state}.")


    original_dataset_staged_path = Path(original_dataset['staged_path']).resolve() if \
        original_dataset['staged_path'] is not None else None
    original_dataset_bundle_path = Path(original_dataset['bundle']['path']).resolve() if \
            (original_dataset['bundle'] is not None and
             original_dataset['bundle']['path'] is not None)\
        else None

    # Once original dataset has been removed from the database, remove it
    # from the filesystem (`staged_path` and the corresponding bundle's path).
    if original_dataset_staged_path is not None and original_dataset_staged_path.exists():
        shutil.rmtree(original_dataset_staged_path)
    if original_dataset_bundle_path is not None and original_dataset_bundle_path.exists():
        original_dataset_bundle_path.unlink()

    api.add_state_to_dataset(dataset_id=original_dataset['id'], state='RESOURCES_PURGED')

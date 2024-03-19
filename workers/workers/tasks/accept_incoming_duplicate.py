from __future__ import annotations  # type unions by | are only available in versions >= 3

import json
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
    
    logger.info(f"duplicate dataset id: {duplicate_dataset_id}")

    if not incoming_duplicate_dataset['is_duplicate']:
        raise InspectionFailed(f"Dataset {incoming_duplicate_dataset['id']} is not a duplicate")
    
    matching_datasets = api.get_all_datasets(
        name=incoming_duplicate_dataset['name'],
        dataset_type=incoming_duplicate_dataset['type'],
        is_duplicate=False,
        deleted=False,
        bundle=True
    )
    if len(matching_datasets) != 1:
        raise InspectionFailed(f"Expected to one active (not deleted) dataset named {incoming_duplicate_dataset['name']} (the original), "
                               f"but found {len(matching_datasets)}.")

    original_dataset = matching_datasets[0]        
    
    logger.info("FILTERED:")
    matching_dataset_names = [d['id'] for d in matching_datasets]
    logger.info(json.dumps(matching_dataset_names, indent=2))

    # filtered_dataset_names = [d['name'] for d in filtered_datasets]
    # logger.info(json.dumps(filtered_dataset_names, indent=2))

    original_dataset_staged_path = Path(original_dataset['staged_path']).resolve()
    original_dataset_bundle_path = Path(original_dataset['bundle']['path']).resolve() if\
        original_dataset['bundle'] is not None\
        else None

    accepted_incoming_dataset = api.accept_duplicate_dataset(
        dataset_id=incoming_duplicate_dataset['id'],
    )
    # Once original dataset has been removed from the database, remove it
    # from the filesystem (`staged_path` and the corresponding bundle's path).
    if original_dataset_staged_path.exists():
        shutil.rmtree(original_dataset_staged_path)
    if original_dataset_bundle_path is not None and original_dataset_bundle_path.exists():
        shutil.rmtree(original_dataset_bundle_path)

    return accepted_incoming_dataset['id'],


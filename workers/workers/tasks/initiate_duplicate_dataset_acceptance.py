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
    # incoming_duplicate_dataset = api.get_dataset(dataset_id=duplicate_dataset_id)
    #
    # logger.info(f"duplicate dataset id: {duplicate_dataset_id}")
    #
    # if not incoming_duplicate_dataset['is_duplicate']:
    #     raise InspectionFailed(f"Dataset {incoming_duplicate_dataset['id']} is not a duplicate")
    #
    # # assumes states are sorted in descending order by timestamp
    # latest_state = incoming_duplicate_dataset['states'][0]['state']
    # if latest_state != 'DUPLICATE_READY':
    #     raise InspectionFailed(f"Dataset {incoming_duplicate_dataset['id']} needs to reach state"
    #                            f" DUPLICATE_READY before it can be"
    #                            f" accepted. Current state is {latest_state}.")
    #
    # matching_datasets = api.get_all_datasets(
    #     name=incoming_duplicate_dataset['name'],
    #     dataset_type=incoming_duplicate_dataset['type'],
    #     is_duplicate=False,
    #     deleted=False,
    #     bundle=True
    # )
    # if len(matching_datasets) != 1:
    #     raise InspectionFailed(f"Expected to find one active (not deleted) original {incoming_duplicate_dataset['type']} named {incoming_duplicate_dataset['name']},"
    #                            f" but found {len(matching_datasets)}.")
    #
    # original_dataset = matching_datasets[0]
    #
    # logger.info("FILTERED:")
    # matching_dataset_names = [d['id'] for d in matching_datasets]
    # logger.info(json.dumps(matching_dataset_names, indent=2))
    #
    # # filtered_dataset_names = [d['name'] for d in filtered_datasets]
    # # logger.info(json.dumps(filtered_dataset_names, indent=2))
    #
    # original_dataset_staged_path = Path(original_dataset['staged_path']).resolve()
    # original_dataset_bundle_path = Path(original_dataset['bundle']['path']).resolve() if\
    #     original_dataset['bundle'] is not None\
    #     else None

    # This call to the API validates the states of the incoming duplicate
    # dataset and the original dataset. If the states are correct, it puts
    # a lock on the original and the duplicate datasets, and initiates the
    # duplicate dataset's acceptance into the system by updating the
    # datasets state in the database.
    duplicate_being_accepted = api.initiate_duplicate_dataset_acceptance(
        duplicate_dataset_id=duplicate_dataset_id,
    )


    # once the filesystem resources associated with the original dataset have been cleaned up,
    # the original and the duplicate dataset's statues can be updated.

    return duplicate_being_accepted['id'],


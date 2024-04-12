from __future__ import annotations  # type unions by | are only available in versions >= 3

import shutil
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.exceptions import InspectionFailed
from workers.dataset import get_bundle_staged_path

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def purge(celery_task, duplicate_dataset_id, **kwargs):
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

    if matching_datasets[0]['id'] != incoming_duplicate_dataset['duplicated_from']['original_dataset_id']:
        raise InspectionFailed(f"Expected dataset {duplicate_dataset_id} to have "
                               f"been duplicated from dataset "
                               f"{incoming_duplicate_dataset['duplicated_from']['original_dataset_id']}, "
                               f"but matching dataset has id {matching_datasets[0]['id']}.")

    original_dataset = api.get_dataset(dataset_id=matching_datasets[0]['id'], bundle=True)

    if original_dataset['is_duplicate']:
        raise InspectionFailed(f"Dataset {original_dataset['id']} is a duplicate.")
    if original_dataset['is_deleted']:
        raise InspectionFailed(f"Dataset {original_dataset['id']} is deleted.")

    original_dataset_latest_state = original_dataset['states'][0]['state']
    if (original_dataset_latest_state != config['DATASET_STATES']['OVERWRITE_IN_PROGRESS']
            # check for state ORIGINAL_DATASET_RESOURCES_PURGED as well, so this step stays resumable.
            and original_dataset_latest_state != config['DATASET_STATES']['ORIGINAL_DATASET_RESOURCES_PURGED']):
        raise InspectionFailed(f"Expected dataset {original_dataset['id']} to be in one of states "
                              f"{config['DATASET_STATES']['OVERWRITE_IN_PROGRESS']} or {config['DATASET_STATES']['ORIGINAL_DATASET_RESOURCES_PURGED']}, but current state is "
                              f"{original_dataset_latest_state}.")

    original_dataset_staged_path = Path(original_dataset['staged_path']).resolve() if \
        original_dataset['staged_path'] is not None else None
    original_dataset_bundle_path = Path(get_bundle_staged_path(dataset=original_dataset)).resolve() if \
            original_dataset['bundle'] is not None else None

    if original_dataset_latest_state == config['DATASET_STATES']['OVERWRITE_IN_PROGRESS']:
        if original_dataset_staged_path is not None and original_dataset_staged_path.exists():
            shutil.rmtree(original_dataset_staged_path)
        if original_dataset_bundle_path is not None and original_dataset_bundle_path.exists():
            original_dataset_bundle_path.unlink()

    if original_dataset_latest_state != config['DATASET_STATES']['ORIGINAL_DATASET_RESOURCES_PURGED']:
        api.add_state_to_dataset(dataset_id=original_dataset['id'],
                                 state=config['DATASET_STATES']['ORIGINAL_DATASET_RESOURCES_PURGED'])

    return duplicate_dataset_id,

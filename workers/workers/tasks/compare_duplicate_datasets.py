from __future__ import annotations  # type unions by | are only available in versions >= 3

import json

from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.exceptions import InspectionFailed
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def compare_datasets(celery_task, duplicate_dataset_id, **kwargs):
    logger.info(f"Processing dataset {duplicate_dataset_id}")
    duplicate_dataset: dict = api.get_dataset(dataset_id=duplicate_dataset_id,
                                              include_duplications=True,
                                              include_action_items=True)

    if not duplicate_dataset['is_duplicate']:
        raise InspectionFailed(f"Dataset {duplicate_dataset['id']} is not a duplicate")

    # assumes states are sorted in descending order by timestamp
    latest_state = duplicate_dataset['states'][0]['state']
    if latest_state != config['DATASET_STATES']['INSPECTED']:
        raise InspectionFailed(f"Dataset {duplicate_dataset['id']} needs to reach state INSPECTED before it can be"
                               f" compared for duplication. Current state is {latest_state}.")

    matching_datasets = api.get_all_datasets(
        name=duplicate_dataset['name'],
        dataset_type=duplicate_dataset['type'],
        is_duplicate=False,
        deleted=False,
    )

    if len(matching_datasets) != 1:
        raise InspectionFailed(f"Expected to find one active (not deleted) original {duplicate_dataset['type']} named {duplicate_dataset['name']},"
                               f" but found {len(matching_datasets)}.")

    original_dataset: dict = matching_datasets[0]

    if original_dataset['id'] != duplicate_dataset['duplicated_from']['original_dataset_id']:
        raise InspectionFailed(f"Expected dataset {duplicate_dataset['id']} to have "
                               f"been duplicated from dataset "
                               f"{duplicate_dataset['duplicated_from']['original_dataset_id']}, "
                               f"but matching dataset has id {original_dataset['id']}.")

    duplicate_files: list[dict] = api.get_dataset_files(
        dataset_id=duplicate_dataset['id'],
        filters={
            "filetype": "file"
        })
    original_files: list[dict] = api.get_dataset_files(
        dataset_id=original_dataset['id'],
        filters={
            "filetype": "file"
        })

    comparison_checks_report = compare_dataset_files(original_files, duplicate_files)
    # logger.info(f"are_files_same: {are_files_same}")
    logger.info('comparison_checks_report')
    logger.info(comparison_checks_report)

    # In case datasets are same, instead of rejecting the incoming (duplicate) dataset at this point,
    # create an action item for operators to review later. This way, in case our comparison process
    # mistakenly assumes the incoming dataset to be a duplicate, operators will still have a chance
    # to review the incoming dataset before it is rejected.    

    # Exactly one action item of type DUPLICATE_DATASET_INGESTION is created for a duplicate dataset.
    duplication_action_item: dict = [item for item in duplicate_dataset['action_items']
                                     if item['type'] == 'DUPLICATE_DATASET_INGESTION'][0]

    action_item_data: dict = {
       "ingestion_checks": comparison_checks_report,
        "next_state": config['DATASET_STATES']['DUPLICATE_READY'],
    }

    api.update_dataset_action_item(dataset_id=duplicate_dataset['id'],
                                   action_item_id=duplication_action_item['id'],
                                   data=action_item_data)

    logger.info(f"Processed dataset {duplicate_dataset_id}")
    return duplicate_dataset_id,


# Given two lists of dataset files, determines if the two sets of files are duplicates. The following checks are used
# to determine whether files are same:
#    1. Comparing number of files in both datasets
#    2. Comparing checksums of files in both datasets
#    3. Verifying if any files from the original dataset are missing from the incoming duplicate.
#    4. Verifying if any files from the incoming duplicate dataset are missing from the original.
#
# Returns a tuple, the first element of which is a bool indicating whether both sets of files
# are same, with the second element being a detailed comparison report containing the results
# for each of the 3 checks performed.
#
# Example of comparison report:

# [
#   {
#     type: 'CHECKSUMS_MATCH',
#     label: 'Checksums Validated',
#     passed: False,
#     report: {
#       conflicting_checksum_files: [{
#         name: 'checksum_error_file_1',
#         path: '/path/to/checksum_error_file_1',
#         original_md5: 'original_md5',
#         duplicate_md5: 'duplicate_md5',
#       }, {
#         name: 'checksum_error_file_2',
#         path: '/path/to/checksum_error_file_2',
#         original_md5: 'original_md5',
#         duplicate_md5: 'duplicate_md5',
#       }],
#     },
#   }, {
#     type: 'FILES_MISSING_FROM_DUPLICATE',
#     label: 'Original dataset\'s files missing from incoming duplicate',
#     passed: False,
#     report: {
#       missing_files: [{
#         name: 'missing_file_1',
#         path: '/path/to/missing_file_1',
#       }, {
#         name: 'missing_file_2',
#         path: '/path/to/missing_file_1',
#       }],
#     },
#   }, {
#     type: 'FILES_MISSING_FROM_ORIGINAL',
#     label: 'Incoming duplicate dataset\'s files missing from original',
#     passed: False,
#     report: {
#       missing_files: [{
#         name: 'missing_file_1',
#         path: '/path/to/missing_file_1',
#       }, {
#         name: 'missing_file_2',
#         path: '/path/to/missing_file_1',
#       }],
#     },
#   }
# ]
def compare_dataset_files(original_dataset_files: list, duplicate_dataset_files: list) -> list[dict]:
    comparison_checks: list[dict] = []

    original_files_set: set[str] = set(map(lambda f: f['path'], original_dataset_files))
    duplicate_files_set: set[str] = set(map(lambda f: f['path'], duplicate_dataset_files))

    common_files: set[str] = original_files_set.intersection(duplicate_files_set)

    logger.info(f"len(common_files): {len(common_files)}")

    conflicting_checksum_files: list[dict] = []
    for file_path in common_files:
        original_file = [f for f in original_dataset_files if f['path'] == file_path][0]
        original_file_checksum = original_file['md5']
        duplicate_file_checksum = [f for f in duplicate_dataset_files if f['path'] == file_path][0]['md5']

        if original_file_checksum != duplicate_file_checksum:
            conflicting_checksum_files.append({
                'name': original_file['name'],
                'path': original_file['path'],
                'original_md5': original_file_checksum,
                'duplicate_md5': duplicate_file_checksum,
            })
    
    logger.info(json.dumps(conflicting_checksum_files, indent=2))

    # Files that are present in the original dataset and missing from the duplicate
    original_only_files: set[str] = original_files_set.difference(duplicate_files_set)
    # Files that are present in the duplicate dataset and missing from the original
    duplicate_only_files: set[str] = duplicate_files_set.difference(original_files_set)

    files_missing_from_duplicate = []
    for file_path in original_only_files:
        file = [f for f in original_dataset_files if f['path'] == file_path][0]
        files_missing_from_duplicate.append({
            'name': file['name'],
            'path': file['path']
        })
    files_missing_from_original = []
    for file_path in duplicate_only_files:
        file = [f for f in duplicate_dataset_files if f['path'] == file_path][0]
        files_missing_from_original.append({
            'name': file['name'],
            'path': file['path']
        })

    passed_checksum_validation = len(conflicting_checksum_files) == 0
    comparison_checks.append({
        'type': 'CHECKSUMS_MATCH',
        'label': 'Checksums Validated',
        'passed': passed_checksum_validation,
        'report': {
            'conflicting_checksum_files': conflicting_checksum_files
        }
    })

    comparison_checks.append({
        'type': 'FILES_MISSING_FROM_DUPLICATE',
        'label': 'Original dataset\'s files missing from incoming duplicate',
        'passed': len(original_only_files) == 0,
        'report': {
            'missing_files': files_missing_from_duplicate
        }
    })
    comparison_checks.append({
        'type': 'FILES_MISSING_FROM_ORIGINAL',
        'label': 'Incoming duplicate dataset\'s files missing from original',
        'passed': len(duplicate_only_files) == 0,
        'report': {
            'missing_files': files_missing_from_original
        }
    })

    return comparison_checks

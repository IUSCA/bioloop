from __future__ import annotations  # type unions by | are only available in versions >= 3

import json

from celery import Celery
from celery.utils.log import get_task_logger

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.exceptions import InspectionFailed, RetryableException
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def compare_datasets(celery_task, duplicate_dataset_id, **kwargs):
    logger.info(f"Processing duplicate dataset {duplicate_dataset_id}")
    # todo - retryable exception
    duplicate_dataset: dict = api.get_dataset(dataset_id=duplicate_dataset_id,
                                              include_duplications=True,
                                              include_action_items=True)

    # todo - dont retry
    if not duplicate_dataset['is_duplicate']:
        raise InspectionFailed(f"Dataset {duplicate_dataset['id']} is not a duplicate")

    original_dataset_id = duplicate_dataset['duplicated_from']['original_dataset_id']
    original_dataset: dict = api.get_dataset(dataset_id=original_dataset_id)

    logger.info(f"Dataset is duplicate of dataset {original_dataset['name']} (id: {original_dataset_id})")

    # todo - retryable exception
    duplicate_files: list[dict] = api.get_dataset_files(
        dataset_id=duplicate_dataset['id'],
        filters={
            "filetype": "file"
        })
    # todo - retryable exception
    original_files: list[dict] = api.get_dataset_files(
        dataset_id=original_dataset['id'],
        filters={
            "filetype": "file"
        })

    comparison_checks_report = None
    try:
        comparison_checks_report = compare_dataset_files(original_files, duplicate_files)
    except Exception:
        # todo - retryable exception
        raise RetryableException("Failed to compare dataset files")

    # In case datasets are same, instead of rejecting the incoming (duplicate) dataset at this point,
    # create an action item for operators to review later. This way, operators will always have a chance
    # to review the incoming dataset before it is rejected.
    duplication_action_item: dict = [item for item in duplicate_dataset['action_items']
                                     if item['type'] == config['ACTION_ITEM_TYPES']['DUPLICATE_DATASET_INGESTION']][0]

    action_item_data: dict = {
       "ingestion_checks": comparison_checks_report,
       "next_state": config['DATASET_STATES']['DUPLICATE_READY'],
    }

    # todo - retryable exception
    api.update_dataset_action_item(dataset_id=duplicate_dataset['id'],
                                   action_item_id=duplication_action_item['id'],
                                   data=action_item_data)

    logger.info(f"Processed dataset {duplicate_dataset_id}")
    return duplicate_dataset_id,


# Given two lists of dataset files, determines if the two sets of files are duplicates. The following checks are used
# to determine whether files are same:
#    1. Verifying if the number of files in both datasets is the same
#    2. Comparing checksums of files in both datasets
#    3. Verifying if any files from the original dataset are missing from the incoming duplicate.
#    4. Verifying if any files from the incoming duplicate dataset are missing from the original.
#
# Returns a dict, which contains the results for each of the 3 checks performed.
#
# Example of comparison report:

# [
#   {
#     'type': 'FILE_COUNT',
#       'label': 'Number of Files match',
#       'passed': len(original_dataset_files) == len(duplicate_dataset_files),
#         'report': {
#           'num_files_original_dataset': len(original_dataset_files),
#           'num_files_duplicate_dataset': len(duplicate_dataset_files),
#     }
#   },
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

    files_only_in_original_dataset: list[dict] = get_missing_files(files_1=original_dataset_files, files_2=duplicate_dataset_files)
    files_only_in_duplicate_dataset: list[dict] = get_missing_files(files_1=duplicate_dataset_files, files_2=original_dataset_files)

    original_files_paths: set[str] = set(map(lambda f: f['path'], original_dataset_files))
    duplicate_files_paths: set[str] = set(map(lambda f: f['path'], duplicate_dataset_files))
    original_files_map: dict = {f['path']: f for f in original_dataset_files}
    duplicate_files_map: dict = {f['path']: f for f in duplicate_dataset_files}

    common_files_paths: set[str] = original_files_paths.intersection(duplicate_files_paths)

    logger.info(f"len(common_files_paths): {len(common_files_paths)}")

    conflicting_checksum_files: list[dict] = []
    for file_path in common_files_paths:
        original_file = original_files_map.get(file_path)
        duplicate_file = duplicate_files_map.get(file_path)
        original_file_checksum = original_file['md5']
        duplicate_file_checksum = duplicate_file['md5']
        if original_file_checksum != duplicate_file_checksum:
            logger.info(f"Checksum validation failed for file {file_path} (original: {original_file['id']}, duplicate: {duplicate_file['id']})")
            conflicting_checksum_files.append(original_file)
            conflicting_checksum_files.append(duplicate_file)
    
    # logger.info(json.dumps(conflicting_checksum_files, indent=2))

    # if there are no common files between the two datasets, we consider that checksum validation failed
    # todo - all files from both datasets should be shown in UI in case of two datasets not having any common files
    #  under section 'files missing from original/duplicate dataset'. No files should be shown under checksum-diff section.
    passed_checksum_validation: bool = len(common_files_paths) > 0 and len(conflicting_checksum_files) == 0
    logger.info(f"Checksum validation passed: {passed_checksum_validation}")
    
    comparison_checks.append({
        'type': 'FILE_COUNT',
        'label': 'Number of Files match',
        'passed': len(original_dataset_files) == len(duplicate_dataset_files),
    })

    comparison_checks.append({
        'type': 'CHECKSUMS_MATCH',
        'label': 'Checksums Validated',
        'passed': passed_checksum_validation,
        'files': [{'id': f['id']} for f in conflicting_checksum_files]
    })

    logger.info(f"Files only in original dataset: {len(files_only_in_original_dataset)}")
    comparison_checks.append({
        'type': 'FILES_MISSING_FROM_DUPLICATE',
        'label': 'Original dataset\'s files missing from incoming duplicate',
        'passed': len(files_only_in_original_dataset) == 0,
        'files': [{'id': f['id']} for f in files_only_in_original_dataset]
    })
    
    logger.info(f"Files only in duplicate dataset: {len(files_only_in_duplicate_dataset)}")
    comparison_checks.append({
        'type': 'FILES_MISSING_FROM_ORIGINAL',
        'label': 'Incoming duplicate dataset\'s files missing from original',
        'passed': len(files_only_in_duplicate_dataset) == 0,
        'files': [{'id': f['id']} for f in files_only_in_duplicate_dataset]
    })

    return comparison_checks


# For two given lists of dataset files (files_1 and files_2), returns a list of files
# that are present in files_1 but not present in files_2.
def get_missing_files(files_1: list[dict], files_2: list[dict]) -> list[dict]:
    missing_files = []
    files_map_2 = {f['path']: f for f in files_2}
    for file in files_1:
        if file['path'] not in files_map_2.keys():
            missing_files.append(file)
    return missing_files

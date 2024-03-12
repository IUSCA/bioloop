from __future__ import annotations  # type unions by | are only available in versions >= 3

import itertools
import hashlib
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

def compare_datasets(celery_task, duplicate_dataset_id, **kwargs):
    logger.info(f"Processing dataset {duplicate_dataset_id}")

    duplicate_dataset = api.get_dataset(dataset_id=duplicate_dataset_id)
    duplicate_files = api.get_dataset_files(
        dataset_id=duplicate_dataset['id'],
        filters={
            "filetype": "file"
        })

    matching_datasets = api.get_all_datasets(name=duplicate_dataset['name'])
    if len(matching_datasets) > 2:
        raise InspectionFailed(f"Expected 2 datasets named {duplicate_dataset['name']} (original and duplicate), "
                               f"but found more.")

    original_dataset = list(filter(lambda d: d['id'] != duplicate_dataset['id'], matching_datasets))[0]
    original_files = api.get_dataset_files(
        dataset_id=original_dataset['id'],
        filters={
            "filetype": "file"
        })

    are_files_same, comparison_checks_report = compare_dataset_files(original_files, duplicate_files)
    logger.info(f"are_files_same: {are_files_same}")
    logger.info('comparison_checks_report')
    logger.info(comparison_checks_report)

    # In case datasets are same, instead of rejecting the incoming (duplicate) dataset at this point,
    # create an action item for operators to review later. This way, in case our comparison process
    # mistakenly assumes the incoming dataset to be a duplicate, operators will still have a chance
    # to review the incoming dataset before it is rejected.

    api.post_dataset_notification({
        "type": "DUPLICATE_INGESTION",
        "label": "Duplicate Ingestion",
        "checks": comparison_checks_report,
        "metadata": {
            "original_dataset_id": original_dataset['id'],
            "duplicate_dataset_id": duplicate_dataset['id'],
        }
    })

    logger.info(f"Processed dataset {duplicate_dataset_id}")
    return duplicate_dataset_id,


# Given two lists of dataset files, determines if the two sets of files are duplicates. The following checks are used
# to determine whether files are same:
#    1. Comparing number of files in both datasets
#    2. Comparing checksums of files in both datasets
#    3. Verifying if each file from the original dataset is present in the duplicate.
#
# Returns a tuple, the first element of which is a bool indicating whether both sets of files
# are same, with the second element being a detailed comparison report containing the results
# for each of the 3 checks performed.
#
# Example of comparison report:

# [
#   {
#     type: 'FILE_COUNT',
#     label: 'Number of Files Match',
#     passed: True,
#     report: {
#       original_files_count: 20,
#       duplicate_files_count: 20,
#     },
#   }, {
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
#     type: 'NO_MISSING_FILES',
#     label: 'All Original Files Found',
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
def compare_dataset_files(original_files: list, duplicate_files: list) -> tuple:
    num_files_same = len(original_files) == len(duplicate_files)
    comparison_checks = [{
        'type': 'FILE_COUNT',
        'passed': num_files_same,
        'report': {
            'original_files_count': len(original_files),
            'duplicate_files_count': len(duplicate_files)
        }
    }]

    # maybe_same = True
    conflicting_checksum_files = []
    missing_files = []
    for original in original_files:
        # logger.info(f"processing original: {original['name']}")
        found_file = False
        for duplicate in duplicate_files:
            # logger.info(f"processing duplicate: - {duplicate['name']}")
            if original['path'] != duplicate['path']:
                # logger.info("names not same --- continue to next duplicate")
                continue
            else:
                found_file = True
                checksum_validated = original['md5'] == duplicate['md5']
                # logger.info(f"checksum_validated: {checksum_validated}")
                # logger.info(f"maybe_same: {maybe_same}")
                # maybe_same = maybe_same and checksum_validated
                if not checksum_validated:
                    #     logger.info(f"original['md5']: {original['md5']}")
                    #     logger.info(f"duplicate['md5']: {duplicate['md5']}")
                    conflicting_checksum_files.append({
                        'name': original['name'],
                        'path': original['path'],
                        'original_md5': original['md5'],
                        'duplicate_md5': duplicate['md5'],
                    })
                # Once original file has been found, end the loop.
                break
        if not found_file:
            logger.info(f"original file {original['name']} not found in list_2")
            missing_files.append({
                'name': original['name'],
                'path': original['path'],
            })

    passed_checksum_validation = len(conflicting_checksum_files) == 0
    passed_missing_files_check = len(missing_files) == 0

    comparison_checks.append({
        'type': 'CHECKSUMS_MATCH',
        'passed': passed_checksum_validation,
        'report': {
            'conflicting_checksum_files': conflicting_checksum_files
        }
    })
    comparison_checks.append({
        'type': 'NO_MISSING_FILES',
        'passed': passed_missing_files_check,
        'report': {
            'missing_files': missing_files
        }
    })

    are_files_same = num_files_same and passed_missing_files_check and passed_missing_files_check
    return are_files_same, comparison_checks


# def update_directory_md5(directory, computed_hash):
#     assert Path(directory).is_dir()
#     for path in sorted(Path(directory).iterdir(), key=lambda p: str(p).lower()):
#         computed_hash.update(path.name.encode())
#         if path.is_file():
#             with open(path, "rb") as f:
#                 for chunk in iter(lambda: f.read(4096), b""):
#                     computed_hash.update(chunk)
#         elif path.is_dir():
#             computed_hash = update_directory_md5(path, computed_hash)
#     return computed_hash
#
#
# def directory_checksum(directory):
#     return update_directory_md5(directory, hashlib.md5()).hexdigest()



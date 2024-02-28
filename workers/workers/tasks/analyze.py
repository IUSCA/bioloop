from __future__ import annotations  # type unions by | are only available in versions >= 3

import itertools
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm.progress import Progress

import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
from workers import exceptions as exc
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)

def analyze_dataset(celery_task, dataset_id, **kwargs):
    original_dataset = api.get_dataset(dataset_id=dataset_id, files=True)
    original_files = original_dataset['files']

    duplicate_dataset = api.get_all_datasets(
        dataset_type=config['dataset_types']['DUPLICATE']['label'],
        name=original_dataset['name'],
        include_files=True,
    )
    duplicate_files = duplicate_dataset['files']


    is_duplicate = compare_file(original_files, duplicate_files)
    return is_duplicate

def compare_file(files_1, files_2):
    if len(files_1) != len(files_2):
        return False

    # check set difference


    files = itertools.product(files_1, files_2)

    

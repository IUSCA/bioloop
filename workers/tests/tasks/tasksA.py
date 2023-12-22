import logging
import os
import time

from celery import Celery
from celery.utils.log import get_task_logger

import workers.config.celeryconfig as celeryconfig
from tests import utils
# noinspection PyUnresolvedReferences
from workers import exceptions as exc

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)
logger.setLevel(logging.DEBUG)


def task1(celery_task, dataset_id, **kwargs):
    logger.info(f'task - {os.getpid()} 1 starts with {dataset_id}')

    # cmd.execute(['ls', '-l123'])
    i = 0
    while i < 120:
        i = i + 1
        logger.info(i)
        time.sleep(1)
    return dataset_id, {'return_obj': 'foo'}


def task2(celery_task, dataset_id, **kwargs):
    logger.warning(f'task - {os.getpid()} 2 starts with {dataset_id}')

    utils.f1(1, 2, 3, foo='baz')

    # raise exc.ValidationFailed(['/path/to/file1', 'hash mismatch'])

    # throw a retryable error
    # 1/0

    i = 0
    while i < 240:
        i = i + 1
        logger.info(i)
        time.sleep(1)
    return dataset_id,


def task3(celery_task, dataset_id, **kwargs):
    logger.info(f'task - {os.getpid()} 3 starts with {dataset_id}')
    i = 0
    while i < 120:
        i = i + 1
        logger.info(i)
        time.sleep(1)
    return dataset_id,

import logging
import os
import time

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask

import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)
logger.setLevel(logging.DEBUG)


@app.task(base=WorkflowTask, bind=True)
def task1(celery_task, dataset_id, **kwargs):
    logger.info(f'task - {os.getpid()} 1 starts with {dataset_id}')
    cmd.execute(['ls', '-l123'])
    time.sleep(1)
    return dataset_id, {'return_obj': 'foo'}


@app.task(base=WorkflowTask, bind=True)
def task2(celery_task, dataset_id, **kwargs):
    logger.warning(f'task - {os.getpid()} 2 starts with {dataset_id}')
    i = 0
    while i < 10 * 15:
        i = i + 10
        logger.info(i)
        time.sleep(1)
    return dataset_id,


@app.task(base=WorkflowTask, bind=True)
def task3(celery_task, dataset_id, **kwargs):
    logger.info(f'task - {os.getpid()} 3 starts with {dataset_id}')
    time.sleep(1)
    return dataset_id,

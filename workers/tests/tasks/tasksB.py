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


def task4(celery_task, dataset_id, **kwargs):
    logger.info(f'task - {os.getpid()} 4 starts with {dataset_id}')
    time.sleep(1)
    args = ['python', '-u', '-m', 'tests.dummy_cmd', 'arg1', 'arg2', '--kwarg1']
    cmd.execute_with_log_tracking(args, celery_task, blocking_delay=2.5)

    args = ['python', '-u', '-m', 'tests.dummy_cmd', 'arg2', 'arg3', '--kwarg2']
    cmd.execute_with_log_tracking(args, celery_task, blocking_delay=2.5)

    return dataset_id, {'return_obj': 'foo'}


@app.task(base=WorkflowTask, bind=True)
def task5(celery_task, dataset_id, **kwargs):
    logger.info(f'task - {os.getpid()} 5 starts with {dataset_id}')
    time.sleep(1)
    return dataset_id,

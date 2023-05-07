import os
import time

from celery import Celery
from sca_rhythm import WorkflowTask

import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)


@app.task(base=WorkflowTask, bind=True)
def task1(celery_task, dataset_id, **kwargs):
    print(f'task - {os.getpid()} 1 starts with {dataset_id}')
    time.sleep(1)
    return dataset_id, {'return_obj': 'foo'}


@app.task(base=WorkflowTask, bind=True)
def task2(celery_task, dataset_id, **kwargs):
    print(f'task - {os.getpid()} 2 starts with {dataset_id}')
    i = 0
    while i < 10 * 60:
        i = i + 1
        print(i)
        time.sleep(1)
    return dataset_id,


@app.task(base=WorkflowTask, bind=True)
def task3(celery_task, dataset_id, **kwargs):
    print(f'task - {os.getpid()} 3 starts with {dataset_id}')
    time.sleep(1)
    return dataset_id,

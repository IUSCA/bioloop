import os
import time
import celery
from celery import Celery, Task

import celeryconfig
from workflow import WorkflowTask

app = Celery("tasks")
app.config_from_object(celeryconfig)


# celery -A tasksA worker --concurrency 4

@app.task(base=WorkflowTask)
def task1(batch_id, **kwargs):
    print(f'task - {os.getpid()} 1 starts with {batch_id}')
    time.sleep(3)
    print('done')
    return batch_id

@app.task(base=WorkflowTask)
def task2(batch_id, **kwargs):
    print(f'task - {os.getpid()} 2 starts with {batch_id}')
    time.sleep(3)
    print('done')
    return batch_id

@app.task(base=WorkflowTask)
def task3(batch_id, **kwargs):
    print(f'task - {os.getpid()} 3 starts with {batch_id}')
    time.sleep(3)
    print('done')
    return batch_id
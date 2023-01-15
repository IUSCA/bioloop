import os
import time
import celery
from celery import Celery, Task

import celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)


# celery -A tasksA worker --concurrency 4

@app.task()
def task1(self, dataset_id, **kwargs):
    print(f'task - {os.getpid()} 4 starts with {dataset_id}')
    time.sleep(1)
    return dataset_id

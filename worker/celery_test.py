from celery import Celery

import celeryconfig
from workflow import Workflow

# import all the tasks that the workflow requires
import tasksA

app = Celery("tasks")
app.config_from_object(celeryconfig)
print('\n'.join(app.tasks.keys()))

# task1.apply_async(('batch-123', ))
stages = [
        {
            'name': 'stage-1',
            'task': 'tasksA.task1'
        },
        {
            'name': 'stage-2',
            'task': 'tasksA.task2'
        },
        {
            'name': 'stage-3',
            'task': 'tasksA.task3'
        }
    ]

wf = Workflow(app, steps=stages)
wf.start('batch-123')
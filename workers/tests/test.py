from celery import Celery
from sca_rhythm import Workflow

import workers.config.celeryconfig as celeryconfig
from workers import api

app = Celery("tasks")
app.config_from_object(celeryconfig)
# print('\n'.join(app.tasks.keys()))

APP_ID = 'tests'

steps = [
    {
        'name': 'task1',
        'task': 'task1',
        'queue': f'{APP_ID}.q'
    },
    {
        'name': 'task4',
        'task': 'task4',
        'queue': f'{APP_ID}.q'
    },
]

dataset_id = 2
wf = Workflow(app, steps=steps, name='test_wf', app_id=APP_ID)
api.add_workflow_to_dataset(dataset_id, wf.workflow['_id'])
wf.start(dataset_id)
print('workflow_id', wf.workflow['_id'])

# wf = Workflow(app, workflow_id='1a948b2f-c778-4c34-8bc4-3f05d80d68a8')
# wf.resume()

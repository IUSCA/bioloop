from celery import Celery
from sca_rhythm import Workflow

import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
# print('\n'.join(app.tasks.keys()))

steps = [
    {
        'name': 'archive',
        'task': 'task2'
    }
]

wf = Workflow(app, steps=steps, name='test_wf', app_id='tests')
wf.start('dataset-id-tests')
print('workflow_id', wf.workflow['_id'])

# wf = Workflow(app, workflow_id='1a948b2f-c778-4c34-8bc4-3f05d80d68a8')
# wf.resume()

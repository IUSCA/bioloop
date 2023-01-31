from celery import Celery

import scaworkers.celeryconfig as celeryconfig
from scaworkers.workflow import Workflow

# import all the tasks that the workflow requires

# import workers.archive
# import workers.inspect
# import workers.stage
# import workers.validate

app = Celery("tasks")
app.config_from_object(celeryconfig)
print('\n'.join(app.tasks.keys()))

# inspect.apply_async(('/N/project/DG_Multiple_Myeloma/share/sentieon_val_7/vcf', ))

# task1.apply_async(('batch-123', ))
steps = [
    {
        'name': 'inspect',
        'task': 'tasksA.task1'
    },
    {
        'name': 'archive',
        'task': 'tasksA.task2'
    },
    {
        'name': 'stage',
        'task': 'tasksA.task3'
    }
]

wf = Workflow(app, steps=steps)
wf.start('batch-id-test')
print(wf.workflow['_id'])

# wf = Workflow(app, workflow_id='1a948b2f-c778-4c34-8bc4-3f05d80d68a8')
# wf.resume()

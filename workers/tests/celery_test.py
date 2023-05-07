from celery import Celery

import workers.config.celeryconfig as celeryconfig
# import tasks.archive
# import tasks.inspect
# import tasks.stage
# import tasks.validate
from workers.tasks.report import generate_reports

# import all the tasks that the workflow requires

app = Celery("tasks")
app.config_from_object(celeryconfig)
print('\n'.join(app.tasks.keys()))

generate_reports.apply_async((10,))

# task1.apply_async(('dataset-123', ))
# steps = [
#     {
#         'name': 'inspect',
#         'task': 'tasksA.task1'
#     },
#     {
#         'name': 'archive',
#         'task': 'tasksA.task2'
#     },
#     {
#         'name': 'stage',
#         'task': 'tasksA.task3'
#     }
# ]
#
# wf = Workflow(app, steps=steps)
# wf.start('dataset-id-tests')
# print(wf.workflow['_id'])

# wf = Workflow(app, workflow_id='1a948b2f-c778-4c34-8bc4-3f05d80d68a8')
# wf.resume()

from celery import Celery

import celeryconfig
from workflow import Workflow

# import all the tasks that the workflow requires
# import tasksA
import workers.archive
import workers.inspect
import workers.stage
import workers.validate

app = Celery("tasks")
app.config_from_object(celeryconfig)
print('\n'.join(app.tasks.keys()))

# inspect.apply_async(('/N/project/DG_Multiple_Myeloma/share/sentieon_val_7/vcf', ))

# task1.apply_async(('batch-123', ))
# stages = [
#         {
#             'name': 'inspect',
#             'task': 'workers.inspect.inspect_batch'
#         },
#         {
#             'name': 'archive',
#             'task': 'workers.archive.archive_batch'
#         },
#         {
#             'name': 'stage',
#             'task': 'workers.stage.stage_batch'
#         },
#         {
#             'name': 'validate',
#             'task': 'workers.validate.validate_batch'
#         }
#     ]

# wf = Workflow(app, steps=stages)
# wf.start('/N/project/DG_Multiple_Myeloma/share/sentieon_val_7/vcf')

wf = Workflow(app, workflow_id='1a948b2f-c778-4c34-8bc4-3f05d80d68a8')
wf.resume()

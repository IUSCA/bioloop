from celery import Celery

import scaworkers.api as api
import scaworkers.celeryconfig as celeryconfig
import scaworkers.sda as sda
from scaworkers.workflow import WorkflowTask

app = Celery("tasks")
app.config_from_object(celeryconfig)


@app.task(base=WorkflowTask, bind=True)
def delete_batch(celery_app, batch_id, **kwargs):
    batch = api.get_batch(batch_id=batch_id)
    sda_path = batch['archive_path']
    sda.delete(sda_path)
    update_data = {
        'is_deleted': True
    }
    api.update_batch(batch_id=batch_id, update_data=update_data)
    api.add_state_to_batch(batch_id=batch_id, state='DELETED')
    return batch_id,

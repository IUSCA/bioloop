from celery import Celery

import scaworkers.api as api
import scaworkers.celeryconfig as celeryconfig
import scaworkers.sda as sda
from scaworkers.workflow import WorkflowTask

app = Celery("tasks")
app.config_from_object(celeryconfig)


@app.task(base=WorkflowTask, bind=True)
def delete_dataset(celery_app, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    sda_path = dataset['archive_path']
    sda.delete(sda_path)
    update_data = {
        'is_deleted': True
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='DELETED')
    return dataset_id,

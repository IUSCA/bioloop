from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig
import workers.sda as sda

app = Celery("tasks")
app.config_from_object(celeryconfig)


def delete_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    sda_path = dataset['archive_path']
    sda.delete(sda_path)
    update_data = {
        'archive_path': None,
        'is_deleted': True
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='DELETED')
    return dataset_id,

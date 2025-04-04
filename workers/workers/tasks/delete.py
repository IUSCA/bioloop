from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers.services.storage import storage

app = Celery("tasks")
app.config_from_object(celeryconfig)


def delete_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    archive_path = dataset['archive_path']
    storage.delete(archive_path)
    # id is appended to name to make it unique (database constraint) to allow new datasets to have this same name
    update_data = {
        'archive_path': None,
        'is_deleted': True,
        'name': f"{dataset['name']}-{dataset['id']}"
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='DELETED')
    return dataset_id,

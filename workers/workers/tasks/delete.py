from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig
import workers.sda as sda
import workers.utils as utils
from workers.dataset import is_dataset_locked_for_writes

app = Celery("tasks")
app.config_from_object(celeryconfig)


def delete_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)

    locked, latest_state = is_dataset_locked_for_writes(dataset)
    if locked:
        raise Exception(f"Dataset {dataset['id']} is locked for writes. Dataset's current "
                        f"state is {latest_state}.")

    sda_path = dataset['archive_path']
    sda.delete(sda_path)
    # id is appended to name to make it unique (database constraint) to allow new datasets to have this same name
    update_data = {
        'archive_path': None,
        'is_deleted': True,
        'name': f"{dataset['name']}-{dataset['id']}"
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='DELETED')
    return dataset_id,

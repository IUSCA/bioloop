import shutil

from celery import Celery

import workers.api as api
import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)


def delete_source(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    origin_path = dataset['origin_path']

    shutil.rmtree(origin_path)

    return dataset_id,

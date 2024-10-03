from pathlib import Path

from celery import Celery
from sca_rhythm import WorkflowTask
from sca_rhythm.progress import Progress

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers import illumina
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)


def download_recent_datasets(celery_task: WorkflowTask, download_dir: Path, n_days: int):
    download_dir.mkdir(exist_ok=True, parents=True)
    ds_metas = illumina.list_datasets(n_days)
    ds_ids = [ds_meta['Id'] for ds_meta in ds_metas]

    progress = Progress(celery_task=celery_task, name='datasets', units='items')

    for ds_id in progress(ds_ids):
        illumina.download_dataset(ds_id, str(download_dir))


def download_illumina_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)

    project_name = dataset['name']
    download_path = Path(config['paths']['scratch']) / project_name

    # illumina.download_project(project_name, download_path)
    n_days = config['illumina']['download']['datasets']['n_days']
    download_recent_datasets(celery_task, download_path, n_days)

    update_data = {
        'origin_path': str(download_path)
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='DOWNLOADED')
    return dataset_id,

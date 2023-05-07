from pathlib import Path

from celery import Celery
from sca_rhythm import WorkflowTask

import workers.api as api
import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils
from workers import illumina
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)


@app.task(base=WorkflowTask, bind=True, name=wf_utils.make_task_name('download_illumina_dataset'))
def download_illumina_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    project_name = dataset['name']
    download_path = Path(config['paths']['scratch']) / project_name

    # illumina.download_project(project_name, download_path)
    n_days = config['illumina']['download']['datasets']['n_days']
    illumina.download_recent_datasets(download_path, n_days)

    update_data = {
        'origin_path': str(download_path)
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='DOWNLOADED')
    return dataset_id,

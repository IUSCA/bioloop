from pathlib import Path
from celery import Celery

import scaworkers.api as api
import scaworkers.celeryconfig as celeryconfig
from scaworkers.config import config
from scaworkers.workflow import WorkflowTask
from scaworkers import illumina

app = Celery("tasks")
app.config_from_object(celeryconfig)


@app.task(base=WorkflowTask, bind=True)
def download_illumina_dataset(self, dataset_id, **kwargs):
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

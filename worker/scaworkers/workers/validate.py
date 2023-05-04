import shutil
from datetime import datetime
from pathlib import Path

from celery import Celery

import scaworkers.api as api
import scaworkers.celeryconfig as celeryconfig
import scaworkers.utils as utils
from scaworkers.config import config
from scaworkers.workflow import WorkflowTask

app = Celery("tasks")
app.config_from_object(celeryconfig)


def check_files(dataset_dir, files_metadata):
    dataset_dir = Path(dataset_dir)
    validation_errors = []
    for file_metadata in files_metadata:
        rel_path = file_metadata['path']
        path = dataset_dir / rel_path
        if path.exists():
            digest = utils.checksum(path)
            if digest != file_metadata['md5']:
                validation_errors.append((False, str(path), 'checksum mismatch'))
        else:
            validation_errors.append((False, str(path), 'file does not exist'))
    return validation_errors


# celery -A celery_app worker --concurrency 4
@app.task(base=WorkflowTask, bind=True)
def validate_dataset(celery_app, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, checksums=True)
    dataset_type = dataset['type'].lower()
    staged_path = Path(config['paths'][dataset_type]['stage']) / dataset['name']
    validation_errors = check_files(dataset_dir=staged_path,
                                    files_metadata=dataset['metadata'])
    api.add_state_to_dataset(dataset_id=dataset_id, state='VALIDATED')
    return dataset_id, validation_errors


# TODO: move out of validate
def clean_old_data(dataset):
    stage_dir = Path(config['paths']['stage_dir']).resolve()
    data_age = datetime.strptime(dataset['takenAt'], '%Y-%m-%dT%H:%M:%S.%fZ')
    delta = datetime.now() - data_age
    if delta.days > 30:
        stale_path = stage_dir / dataset['name']
        shutil.rmtree(stale_path)

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


def check_files(batch_dir, files_metadata):
    batch_dir = Path(batch_dir)
    validation_errors = []
    for file_metadata in files_metadata:
        rel_path = file_metadata['path']
        path = batch_dir / rel_path
        if path.exists():
            digest = utils.checksum(path)
            if digest != file_metadata['md5']:
                validation_errors.append((False, str(path), 'checksum mismatch'))
        else:
            validation_errors.append((False, str(path), 'file does not exist'))
    return validation_errors


# celery -A celery_app worker --concurrency 4
@app.task(base=WorkflowTask, bind=True)
def validate_batch(celery_app, batch_id, **kwargs):
    batch = api.get_batch(batch_id=batch_id, include_checksums=True)
    validation_errors = check_files(batch_dir=batch['stage_path'],
                                    files_metadata=batch['metadata'])
    return batch_id, validation_errors


# TODO: move out of validate
def clean_old_data(batch):
    stage_dir = Path(config['paths']['stage_dir']).resolve()
    data_age = datetime.strptime(batch['takenAt'], '%Y-%m-%dT%H:%M:%S.%fZ')
    delta = datetime.now() - data_age
    if delta.days > 30:
        stale_path = stage_dir / batch['name']
        shutil.rmtree(stale_path)

from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask
from sca_rhythm.progress import Progress

import workers.api as api
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
from workers import exceptions as exc

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def check_files(celery_task: WorkflowTask, dataset_dir: Path, files_metadata: list[dict]):
    progress = Progress(celery_task=celery_task, units='files')
    validation_errors = []
    for file_metadata in progress(files_metadata):
        rel_path = file_metadata['path']
        path = dataset_dir / rel_path
        if path.exists():
            digest = utils.checksum(path)
            if digest != file_metadata['md5']:
                validation_errors.append((str(path), 'checksum mismatch'))
        else:
            validation_errors.append((str(path), 'file does not exist'))
    return validation_errors


def validate_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id, files=True)
    staged_path = Path(dataset['staged_path'])

    validation_errors = check_files(celery_task=celery_task,
                                    dataset_dir=staged_path,
                                    files_metadata=dataset['files'])

    if len(validation_errors) > 0:
        logger.warning(f'{len(validation_errors)} validation errors for dataset id: {dataset_id} path: {staged_path}')
        raise exc.ValidationFailed(validation_errors)

    update_data = {
        'is_staged': True
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='STAGED')

    print(f'validate successful for dataset id: {dataset_id}')

    return dataset_id, validation_errors

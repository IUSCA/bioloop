from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask
from sca_rhythm.progress import Progress

import workers.api as api
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
from workers import exceptions as exc
from workers.workflow_utils import check_files
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def validate_dataset_file_checksums(celery_task, ret_val, **kwargs):
    dataset_id, has_incorrect_paths = ret_val

    if not has_incorrect_paths:
        print(f"No incorrect nested paths found for dataset {dataset_id}. File checksums will not be validated.")
        return (dataset_id, has_incorrect_paths),

    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True, files=True)

    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    dataset_path = working_dir / dataset['name']

    print(f'Dataset is present at, {str(dataset_path)}')

    validation_errors = check_files(celery_task=celery_task,
                                    dataset_dir=dataset_path,
                                    files_metadata=dataset['files'])

    if len(validation_errors) > 0:
        logger.warning(f'{len(validation_errors)} validation errors for dataset id: {dataset_id} path: {dataset_path}')
        raise exc.ValidationFailed(validation_errors)

    return (dataset_id, has_incorrect_paths),

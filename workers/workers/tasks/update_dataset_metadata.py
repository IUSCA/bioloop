import shutil
from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm import WorkflowTask, Workflow

import workers.workflow_utils as wf_utils
import workers.api as api
import workers.sda as sda
import workers.config.celeryconfig as celeryconfig
from workers.config import config
from workers.workflow_utils import generate_metadata
from workers.celery_app import app as celery_app

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def compute_updated_bundle_checksum(celery_task: WorkflowTask, dataset: dict, delete_local_file: bool = False):
    updated_sda_bundle_checksum = sda.get_hash(f"{dataset['archive_path']}")

    bundle_attrs = {
        'md5': updated_sda_bundle_checksum,
        'name': dataset['bundle']['name']
    }

    return bundle_attrs


def update_metadata(celery_task, ret_val, **kwargs):
    dataset_id, has_incorrect_paths = ret_val
    if not has_incorrect_paths:
        print(f"No incorrect paths found for dataset {dataset_id}. Metadata will not be updated.")
        return dataset_id, has_incorrect_paths

    dataset = api.get_dataset(dataset_id=dataset_id, bundle=True)
    
    working_dir = Path(config['paths'][dataset['type']]['fix_nested_paths']) / f"{dataset['name']}"
    updated_dataset_extracted_path = working_dir / dataset['name']

    archive_download_path = working_dir / dataset['bundle']['name']
    archive_extracted_to_dir = Path(working_dir / f"{dataset['name']}_fix_paths")
    
    source = Path(updated_dataset_extracted_path).resolve()
    num_files, num_directories, size, num_genome_files, metadata = generate_metadata(celery_task, source)

    print(f"Old number of directories: {dataset['num_directories']}")
    print(f"New Number of directories: {num_directories}")

    bundle_attrs = compute_updated_bundle_checksum(celery_task, dataset)

    update_data = {
        'num_directories': num_directories,
        'bundle': bundle_attrs,
    }

    api.update_dataset(dataset_id=dataset_id, update_data=update_data)

    shutil.rmtree(working_dir)

    # Finally, kick off Stage workflow
    wf_body = wf_utils.get_wf_body(wf_name='stage')
    wf = Workflow(celery_app=celery_app, **wf_body)
    api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
    wf.start(dataset_id)
    logger.info(
        f"Started workflow 'stage' for dataset_id: {dataset_id}. Workflow ID: {wf.workflow['_id']}")

    return (dataset_id, has_incorrect_paths),

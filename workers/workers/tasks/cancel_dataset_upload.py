import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger

import workers.config.celeryconfig as celeryconfig
import workers.api as api
from workers.constants.upload import UPLOAD_STATUS

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def purge_uploaded_resources(celery_task, dataset_id, **kwargs):
    print(f"Purging uploaded resources for dataset {dataset_id}")

    dataset = api.get_dataset(dataset_id=dataset_id)

    # Sanity check: Ensure dataset is not already archived.
    sda_path = dataset['archive_path']
    if sda_path is not None:
        raise Exception(
            f"Expected dataset {dataset_id} to not have been archived, but found archive_path: {sda_path}")

    dataset_upload_log = dataset['upload_log']

    # Check if dataset upload is in a processing state. If it is, skip. The resources
    # will be purged by a cleanup process, if necessary.
    if dataset_upload_log['status'] == UPLOAD_STATUS['PROCESSING'] or \
            dataset_upload_log['status'] == UPLOAD_STATUS['PROCESSING_FAILED'] or \
            dataset_upload_log['status'] == UPLOAD_STATUS['COMPLETE']:
        print(f"Dataset upload status is {dataset_upload_log['status']}, "
              f"skipping resource purging for dataset {dataset_id}")
        return dataset_id,

    dataset_origin_path = Path(dataset['origin_path'])
    if dataset_origin_path.exists():
        print(f"Found dataset {dataset_id}'s uploaded resources at: {dataset_origin_path}")
        shutil.rmtree(dataset_origin_path)
        print(f"Deleted dataset {dataset_id}'s uploaded resources")
    else:
        print(f"No uploaded resources found for dataset {dataset_id} at: {dataset_origin_path}")

    # id is appended to name to make it unique (database constraint) to allow new datasets to have this same name
    update_data = {
        'archive_path': None,
        'is_deleted': True,
        'name': f"{dataset['name']}-{dataset['id']}"
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='DELETED')

    return dataset_id,

import logging
from pathlib import Path
from sca_rhythm import Workflow
from pymongo import MongoClient
from workers.config.celeryconfig import result_backend

from workers.celery_app import app as celery_app
import workers.sda as sda
import workers.api as api
import workers.cmd as cmd
import workers.workflow_utils as wf_utils
import workers.utils as utils
from workers.config import config


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def populate_bundle_metadata(dataset: dict) -> bool:
    logger.info(f'populating dataset {dataset["id"]}')

    bundle_md5 = sda.get_hash(dataset['archive_path'])

    bundle_metadata = {
        'name': f'{dataset["name"]}.tar',
        'path': f'{config["paths"][dataset["type"]]["bundle"]}/{dataset["name"]}.tar',
        'size': dataset['bundle_size'],
        'md5': bundle_md5,
    }

    update_data = {
        'bundle': bundle_metadata
    }
    api.update_dataset(dataset_id=dataset['id'], update_data=update_data)

    logger.info(f'successfully finished populating dataset {dataset["id"]}')
    return True


def main():
    WORKFLOW_COLLECTION_NAME = 'workflow_meta'
    TASK_COLLECTION_NAME = 'celery_taskmeta'

    mongo_client = MongoClient(result_backend)
    celery_db = mongo_client.get_default_database()
    workflow_collection = celery_db[WORKFLOW_COLLECTION_NAME]
    task_collection = celery_db[TASK_COLLECTION_NAME]

    archived_datasets = api.get_all_datasets(archived=True, bundle=True)

    unprocessed_datasets = []
    for dataset in archived_datasets:
        logger.info(f'processing dataset {dataset["id"]}')
        bundle_metadata_populated = dataset['bundle'] is not None

        if not bundle_metadata_populated:
            try:
                logger.info(f'will populate bundle for {dataset["id"]}')
                bundle_metadata_populated = populate_bundle_metadata(dataset)
                logger.info(f'bundle_metadata_populated for {dataset["id"]}: {bundle_metadata_populated}')
            except Exception as err:
                logger.info(f'failed to populate bundle for dataset {dataset["id"]}')
                logger.info(err)

        if bundle_metadata_populated:
            # todo - check if wf is not already running for this dataset
            cursor = workflow_collection.find({
                'app_id': config['app_id'],
                'name': 'sync_archived_bundles',
            })
            matching_workflows = list(cursor)
            current_workflow = matching_workflows[0] if len(matching_workflows) > 0 else None

            if current_workflow is None:
                logger.info(f'creating workflow for {dataset["id"]}')
                run_workflows(dataset)
            else:
                logger.info(f'found running workflow for {dataset["id"]}')
                wf_id = current_workflow['_id']
                logger.info(f'wf_id: {wf_id}')
                logger.info(f"status: {current_workflow['status']}")
                if wf_id is not None:
                    # check if status is FAILED/RUNNING
                    wf = Workflow(celery_app=celery_app, workflow_id=wf_id)
                    logger.info(f'workflow {wf_id} can be resumed')
                    # wf.resume()
        else:
            unprocessed_datasets.append(dataset['id'])

    logger.info(f'unpopulated datasets: {unprocessed_datasets}')


def run_workflows(dataset):
    dataset_id = dataset['id']
    wf_body = wf_utils.get_wf_body(wf_name='sync_archived_bundles')
    wf = Workflow(celery_app=celery_app, **wf_body)
    api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
    wf.start(dataset_id)
    logger.info(f'started sync_archived_bundles for {dataset["id"]}, workflow_id: {wf.workflow["_id"]}')


if __name__ == '__main__':
    main()

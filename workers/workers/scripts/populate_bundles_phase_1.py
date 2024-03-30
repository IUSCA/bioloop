import json
import logging
from pathlib import Path
from sca_rhythm import Workflow
from pymongo import MongoClient, DESCENDING
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


class BundlePopulationManager:
    WORKFLOW_COLLECTION_NAME = 'workflow_meta'
    TASK_COLLECTION_NAME = 'celery_taskmeta'

    def __init__(self):
        self.mongo_client = MongoClient(result_backend)
        self.celery_db = self.mongo_client.get_default_database()
        self.workflow_collection = self.celery_db[self.WORKFLOW_COLLECTION_NAME]
        self.task_collection = self.celery_db[self.TASK_COLLECTION_NAME]

    def populate_bundles(self):
        archived_datasets = api.get_all_datasets(archived=True, bundle=True)

        processed_datasets = []
        unprocessed_datasets = []

        for dataset in archived_datasets:
            logger.info(f'processing dataset {dataset["id"]}')

            update_data = {
                'is_staged': False,
                'staged_path': None,
            }
            api.update_dataset(dataset_id=dataset['id'], update_data=update_data)
            logger.info("unstaged dataset")

            bundle_metadata_populated = False
            if dataset['bundle'] is None:
                try:
                    bundle_metadata_populated = self.populate_bundle_metadata(dataset)
                    logger.info(f'bundle_metadata_populated for {dataset["id"]}: {bundle_metadata_populated}')
                except Exception as err:
                    logger.info(f'failed to populate bundle for dataset {dataset["id"]}')
                    logger.info(err)

            if dataset['bundle'] is None and not bundle_metadata_populated:
                unprocessed_datasets.append(dataset)
            else:
                processed_datasets.append(dataset)

        self.run_workflows(processed_datasets)

        unprocessed_datasets_ids = [dataset['id'] for dataset in unprocessed_datasets]
        logger.info(f'unprocessed datasets: {unprocessed_datasets_ids}')
        processed_datasets_ids = [dataset['id'] for dataset in processed_datasets]
        logger.info(f'processed datasets: {processed_datasets_ids}')

    def run_workflows(self, datasets=None):
        logger.info(f'running workflows for {len(datasets)} datasets')
        if datasets is None:
            return

        self.delete_pending_workflows(dry_run=True)

        for ds in datasets:
            logger.info(f'creating workflow for dataset {ds["id"]}')
            self.run_sync_bundle_workflow(ds)


    def run_sync_bundle_workflow(self, dataset):
        dataset_id = dataset['id']
        wf_body = wf_utils.get_wf_body(wf_name='sync_archived_bundles')
        wf = Workflow(celery_app=celery_app, **wf_body)
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
        wf.start(dataset_id)
        logger.info(f'started sync_archived_bundles for {dataset["id"]}, workflow_id: {wf.workflow["_id"]}')

    def delete_pending_workflows(self, app_id: str = config['app_id'], dry_run=False):
        cursor = self.workflow_collection.find({
            'app_id': app_id,
            'name': 'sync_archived_bundles',
            '_status': {
                '$ne': 'SUCCESS'
            }
        })

        matching_workflows = list(cursor)
        logger.info(f'found {len(matching_workflows)} matching workflows')

        workflow_ids = [wf['_id'] for wf in matching_workflows]

        logger.info(f'will delete {len(workflow_ids)} matching workflows')
        if len(workflow_ids) and not dry_run:
            self.workflow_collection.delete_many({'_id': {
                '$in': workflow_ids
            }})

        # delete associated tasks
        _task_ids = [task_run.get('task_id', None)
                     for wf in matching_workflows
                     for step in wf.get('steps', [])
                     for task_run in step.get('task_runs', [])
                     ]
        task_ids = [t for t in _task_ids if t is not None]

        logger.info(f'will delete {len(task_ids)} matching tasks')
        if len(task_ids) and not dry_run:
            res = self.task_collection.delete_many({
                '_id': {
                    '$in': task_ids
                }
            })
            logger.warning(f'Deleted {res.deleted_count} tasks')

    def populate_bundle_metadata(self, dataset: dict) -> bool:
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
    manager = BundlePopulationManager()
    manager.populate_bundles()

if __name__ == '__main__':
    main()

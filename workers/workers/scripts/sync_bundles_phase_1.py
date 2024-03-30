import json
import logging
from pathlib import Path
from sca_rhythm import Workflow
from pymongo import MongoClient, DESCENDING
import fire

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


class BundleSyncManager:
    WORKFLOW_COLLECTION_NAME = 'workflow_meta'
    TASK_COLLECTION_NAME = 'celery_taskmeta'

    def __init__(self, dry_run, app_id):
        self.mongo_client = MongoClient(result_backend)
        self.celery_db = self.mongo_client.get_default_database()
        self.workflow_collection = self.celery_db[self.WORKFLOW_COLLECTION_NAME]
        self.task_collection = self.celery_db[self.TASK_COLLECTION_NAME]
        self.dry_run = dry_run
        self.app_id = app_id


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
            logger.info(f"unstaged dataset {dataset['id']}")

            bundle_metadata_populated = dataset['bundle'] is not None
            if not bundle_metadata_populated:
                try:
                    bundle_metadata_populated = self.populate_bundle_metadata(dataset)
                    logger.info(f'bundle_metadata_populated for {dataset["id"]}: {bundle_metadata_populated}')
                except Exception as err:
                    logger.info(f'failed to populate bundle for dataset {dataset["id"]}')
                    logger.info(err)

            if not bundle_metadata_populated:
                unprocessed_datasets.append(dataset)
            else:
                processed_datasets.append(dataset)

        unprocessed_datasets_ids = [dataset['id'] for dataset in unprocessed_datasets]
        logger.info(f'unprocessed datasets: {unprocessed_datasets_ids}')
        processed_datasets_ids = [dataset['id'] for dataset in processed_datasets]
        logger.info(f'processed datasets: {processed_datasets_ids}')

        self.run_workflows(processed_datasets)


    def run_workflows(self, datasets=None):
        logger.info(f'running workflows for {len(datasets)} datasets')
        if datasets is None:
            return

        self.delete_pending_workflows()

        for ds in datasets:
            logger.info(f'creating workflow for dataset {ds["id"]}')
            self.initiate_download_workflow(ds)


    def initiate_download_workflow(self, dataset):
        dataset_id = dataset['id']
        wf_body = wf_utils.get_wf_body(wf_name='prepare_bundle_downloads')
        wf = Workflow(celery_app=celery_app, **wf_body)
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
        wf.start(dataset_id)
        logger.info(f'started prepare_bundle_downloads for {dataset["id"]}, workflow_id: {wf.workflow["_id"]}')


    def delete_pending_workflows(self):
        cursor = self.workflow_collection.find({
            'app_id': self.app_id,
            'name': 'prepare_bundle_downloads',
            '_status': {
                '$ne': 'SUCCESS'
            }
        })

        matching_workflows = list(cursor)
        logger.info(f'found {len(matching_workflows)} matching workflows')

        workflow_ids = [wf['_id'] for wf in matching_workflows]

        logger.info(f'will delete {len(workflow_ids)} matching workflows')
        if len(workflow_ids) and not self.dry_run:
            res = self.workflow_collection.delete_many({'_id': {
                '$in': workflow_ids
            }})
            logger.info(f'Deleted {res.deleted_count} workflows')

        # delete associated tasks
        _task_ids = [task_run.get('task_id', None)
                     for wf in matching_workflows
                     for step in wf.get('steps', [])
                     for task_run in step.get('task_runs', [])
                     ]
        task_ids = [t for t in _task_ids if t is not None]

        logger.info(f'will delete {len(task_ids)} matching tasks')
        if len(task_ids) and not self.dry_run:
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


def initiate_bundle_sync(app_id=config['app_id'], dry_run=False):
    """
    For the given app_id, creates the bundle metadata for previously-archived datasets, and
    launches a workflow which sets up the bundles for download. Any existing instances of
    the `prepare_bundle_downloads` workflow that are pending will be deleted.

    :param app_id:  app_id to prepare bundle downloads for
    :param dry_run: if True, do not delete pending workflows
    :return:

    example usage:

    python -m workers.scripts.sync_bundles_phase1 --app_id='bioloop-dev.sca.iu.edu' --dry_run
    """

    BundleSyncManager(dry_run=dry_run, app_id=app_id).populate_bundles()


if __name__ == '__main__':
    fire.Fire(initiate_bundle_sync)

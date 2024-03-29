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

    def __init__(self):
        self.mongo_client = MongoClient(result_backend)
        self.celery_db = self.mongo_client.get_default_database()
        self.workflow_collection = self.celery_db[self.WORKFLOW_COLLECTION_NAME]

    def populate_bundles(self):
        archived_datasets = api.get_all_datasets(archived=True, bundle=True)

        unprocessed_datasets = []
        for dataset in archived_datasets:
            logger.info(f'processing dataset {dataset["id"]}')
            bundle_metadata_populated = dataset['bundle'] is not None

            if not bundle_metadata_populated:
                try:
                    logger.info(f'will populate bundle for {dataset["id"]}')
                    bundle_metadata_populated = self.populate_bundle_metadata(dataset)
                    logger.info(f'bundle_metadata_populated for {dataset["id"]}: {bundle_metadata_populated}')
                except Exception as err:
                    logger.info(f'failed to populate bundle for dataset {dataset["id"]}')
                    logger.info(err)

            if not bundle_metadata_populated:
                unprocessed_datasets.append(dataset['id'])

        self.run_workflows(archived_datasets)

        logger.info(f'unpopulated datasets: {unprocessed_datasets}')

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

    def run_workflows(self,
                      datasets=None,
                      app_id: str = config['app_id']):
        if datasets is None:
            datasets = []

        cursor = self.workflow_collection.find({
            'app_id': app_id,
            'name': 'sync_archived_bundles',
            'status': {
                '$not': {
                    '$in': ['SUCCESS']
                }
            }
        })
        # .sort('created_at', DESCENDING)

        matching_workflows = list(cursor)
        logger.info(f'found {len(matching_workflows)} matching workflows')

        for wf in matching_workflows:
            logger.info(f'pausing workflow: {wf["_id"]} : {wf["created_at"]}')
            workflow = Workflow(celery_app=celery_app, workflow_id=wf['_id'])
            workflow.pause()
        #     logger.info(f"other matching wf: {wf['_id']} : {wf['created_at']}")

        # assumes workflows are sorted descending by created_at
        # current_workflow = matching_workflows[0] if len(matching_workflows) > 0 else None

        # logger.info(f"most recent workflow: {current_workflow['_id']} : {current_workflow['created_at']}")
        # logger.info(json.dumps(current_workflow, indent=4))

        for ds in datasets:
            logger.info(f'creating workflow for dataset {ds["id"]}')
            self.run_sync_bundle_workflow(ds)

        # else:
        #     logger.info(f'found running workflow for {dataset["id"]}')
        #     wf_id = current_workflow['_id']
        #     logger.info(f'wf_id: {wf_id}')
        #     logger.info(f"status: {current_workflow['_status']}")
        #     if wf_id is not None:
        #         # check if status is FAILED/RUNNING
        #         # order wfs by desc created_at, kill old ones?
        #         wf = Workflow(celery_app=celery_app, workflow_id=wf_id)
        #         logger.info(f'workflow {wf_id} can be resumed')
        #         wf.resume()

    def run_sync_bundle_workflow(self, dataset):
        dataset_id = dataset['id']
        wf_body = wf_utils.get_wf_body(wf_name='sync_archived_bundles')
        wf = Workflow(celery_app=celery_app, **wf_body)
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
        wf.start(dataset_id)
        logger.info(f'started sync_archived_bundles for {dataset["id"]}, workflow_id: {wf.workflow["_id"]}')


def main():
    manager = BundlePopulationManager()
    manager.populate_bundles()

if __name__ == '__main__':
    main()

import logging
from sca_rhythm import Workflow
import fire
from pymongo import MongoClient
from pprint import pprint

import workers.api as api
from workers.config import config
from workers.config.celeryconfig import result_backend

from workers.celery_app import app as celery_app
import workers.workflow_utils as wf_utils

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ArchivedDatasetPathFixManager:
    WORKFLOW_COLLECTION_NAME = 'workflow_meta'
    TASK_COLLECTION_NAME = 'celery_taskmeta'

    def __init__(self, app_id, dry_run=False):
        self.app_id = app_id
        self.dry_run = dry_run
        self.workflow_name = 'fix_bundle_absolute_paths'

        self.mongo_client = MongoClient(result_backend)
        self.celery_db = self.mongo_client.get_default_database()
        self.workflow_collection = self.celery_db[self.WORKFLOW_COLLECTION_NAME]
        self.task_collection = self.celery_db[self.TASK_COLLECTION_NAME]

        logger.info(f'app_id: {app_id}')

    def fix_bundle_absolute_paths(self):
        """
        Kick off the 'fix_bundle_absolute_paths' workflow on all archived datasets.
        """
        archived_datasets = api.get_all_datasets(archived=True)

        # raise Exception('test exception')

        logger.info(f'Found {len(archived_datasets)} archived datasets')

        app_workflows = api.get_all_workflows()
        app_workflow_ids = [wf['id'] for wf in app_workflows]

        logger.info(f"len(app_workflows): {len(app_workflows)}")
        logger.info(f"len(app_workflow_ids): {len(app_workflow_ids)}")
        logger.info(f"app_workflow_ids: {pprint(app_workflow_ids)}")


        nosql_workflows = self.get_mongo_workflows(app_id=self.app_id,
                                                   workflow_ids=app_workflow_ids,
                                                   workflows_type=self.workflow_name)
        logger.info(f"Found {len(nosql_workflows)} nosql workflows of type {self.workflow_name}")

        for dataset in archived_datasets:
            dataset_id = dataset['id']
            logger.info(f"Iterating over dataset_id: {dataset_id}")
            
            dataset_app_workflows = [wf for wf in app_workflows if wf['dataset_id'] == dataset_id]
            dataset_app_workflow_ids = [wf['id'] for wf in dataset_app_workflows]

            logger.info(f"len(dataset_app_workflows): {len(dataset_app_workflows)}")

            dataset_nosql_workflows = [wf for (i, wf) in enumerate(nosql_workflows) if wf['_id'] in dataset_app_workflow_ids]
            logger.info(f"len(dataset_nosql_workflows): {len(dataset_nosql_workflows)}")

            logger.info(f"typeof dataset_id: {type(dataset_id)}")

            self.initiate_workflow(dataset_id, dataset_nosql_workflows)
                
    def get_mongo_workflows(
            self,
            app_id: str,
            workflow_ids: list[str],
            workflows_type: str,
    ) -> list[dict]:
        cursor = self.workflow_collection.find({
            'app_id': app_id,
            'name': {
                '$eq': workflows_type
            },
            '_id': {
                '$in': workflow_ids
            }
        })
        return list(cursor)
    
    def initiate_workflow(self, dataset_id: str, dataset_nosql_workflows: list[dict]) -> None:
        if dataset_id == 3:
            if len(dataset_nosql_workflows) == 0:
                logger.info(f"No workflows of type {self.workflow_name} are running on dataset_id {dataset_id}. Starting a new one.")
                self.start_workflow(dataset_id)
            else:
                logger.info(f"The following workflows of type {self.workflow_name} are already running on dataset_id {dataset_id}, and a new one will not be started.")
                for wf in dataset_nosql_workflows:
                    logger.info(f"Workflow: {wf['_id']}, status: {wf['_status']}")

    def start_workflow(self, dataset_id: str) -> None:
        wf_body = wf_utils.get_wf_body(wf_name=self.workflow_name)
        wf = Workflow(celery_app=celery_app, **wf_body)
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
        wf.start(dataset_id)
        logger.info(f"Started workflow: {self.workflow_name} for dataset_id: {dataset_id}. Workflow ID: {wf.workflow['_id']}")



def fix_dataset_nested_paths(app_id: str = config['app_id'], dry_run=False):
    """
    Kicks off workflow 'fix_bundle_absolute_paths' on all archived datasets
    for a given app_id, which will fix any nested paths inside each archived
    dataset, recreate its bundle, and archive the recreated bundle to the SDA.

    @param app_id: app_id to purge workflows for
    @param dry_run: if True, do not delete workflows

    example usage:

    python -m workers.scripts.fix_archived_dataset_absolute_path --app_id='bioloop-dev.sca.iu.edu --dry_run
    """
    ArchivedDatasetPathFixManager(app_id, dry_run).fix_bundle_absolute_paths()


if __name__ == "__main__":
    fire.Fire(fix_dataset_nested_paths)

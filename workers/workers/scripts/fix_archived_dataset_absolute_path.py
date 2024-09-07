import logging
from sca_rhythm import Workflow
import fire
from pymongo import MongoClient

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

        mongo_workflows = self.get_mongo_workflows(app_id=self.app_id,
                                                   workflow_ids=app_workflow_ids,
                                                   workflows_type=self.workflow_name)
        mongo_wf_ids = [wf['_id'] for wf in mongo_workflows]

        # Verify that this workflow is not already running on any of the archived datasets
        for wf_id in mongo_wf_ids:
            mongo_wf_index = [i for (i, wf) in enumerate(mongo_workflows) if wf['_id'] == wf_id][0]
            mongo_wf = mongo_workflows[mongo_wf_index]

            print(f'Found mongo workflow: {mongo_wf["_id"]}, name: {mongo_wf["name"]}, for app_id: {mongo_wf["app_id"]}')
            if mongo_wf['_status'] not in ['SUCCESS', 'PENDING', 'RETRY']:
                print(f"Mongo wf status: {mongo_wf['_status']}")

                app_wf_index = [i for (i, wf) in enumerate(app_workflows) if mongo_wf['_id'] == wf['id']][0]
                app_wf = app_workflows[app_wf_index]
                dataset_id = app_wf['dataset_id']

                print(f"Found app workflow: {app_wf['id']} for dataset: {dataset_id}")
                print(f"Will start workflow: {self.workflow_name} for dataset: {dataset_id}")

                if not self.dry_run:
                    wf_body = wf_utils.get_wf_body(wf_name=self.workflow_name)
                    wf = Workflow(celery_app=celery_app, **wf_body)
                    api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
                    wf.start(dataset_id=dataset_id)
                else:
                    print(f"Dry run: would start workflow: {self.workflow_name} for dataset: {dataset_id}")

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

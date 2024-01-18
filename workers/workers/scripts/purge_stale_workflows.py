import logging
from datetime import datetime, timedelta

import fire
from pymongo import MongoClient

import workers.api as api
from workers.config import config
from workers.config.celeryconfig import result_backend

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class WorkflowPurgeManager:
    WORKFLOW_COLLECTION_NAME = 'workflow_meta'
    TASK_COLLECTION_NAME = 'celery_taskmeta'

    def __init__(self, app_id, workflow_types, age_threshold, max_purge_count, dry_run=False):
        self.mongo_client = MongoClient(result_backend)
        self.celery_db = self.mongo_client['celery']
        self.workflow_collection = self.celery_db[self.WORKFLOW_COLLECTION_NAME]
        self.task_collection = self.celery_db[self.TASK_COLLECTION_NAME]

        self.app_id = app_id
        self.workflow_types = workflow_types
        self.age_threshold = age_threshold
        self.max_purges = max_purge_count
        self.dry_run = dry_run

        logger.warning(f'app_id: {app_id}, '
                       f'workflow_types: {workflow_types}, '
                       f'age_threshold: {age_threshold}, '
                       f'max_purges: {max_purge_count}')

    def purge(self):
        """
        Purge orphaned workflows and associated tasks from the result backend
        """
        app_workflows = api.get_all_workflows()
        app_workflow_ids = [wf['id'] for wf in app_workflows]

        orphaned_wfs = self.get_orphaned_workflows(
            app_id=self.app_id,
            current_wf_ids=app_workflow_ids,
            workflows_types=self.workflow_types,
            age_threshold_sec=self.age_threshold
        )

        logger.warning(f'Found {len(orphaned_wfs)} orphaned workflows')

        # sanity check. If the API accidentally returns no workflows then do not blindly delete all the workflows in
        # result backend
        if len(orphaned_wfs) > self.max_purges:
            logger.warning(
                f"Number of orphaned workflows ({len(orphaned_wfs)}) to purge is more than {self.max_purges} (MAX_PURGES). "
                f"Only the first {self.max_purges} will be purged")

        wfs = orphaned_wfs[:self.max_purges]

        wf_ids = [wf['_id'] for wf in wfs]

        _task_ids = [task_run.get('task_id', None)
                     for wf in wfs
                     for step in wf.get('steps', [])
                     for task_run in step.get('task_runs', [])
                     ]
        task_ids = [t for t in _task_ids if t is not None]

        if len(task_ids):
            logger.warning(f'Deletes {len(task_ids)} tasks')
            if not self.dry_run:
                res = self.task_collection.delete_many({
                    '_id': {
                        '$in': task_ids
                    }
                })
                logger.warning(f'Deleted {res.deleted_count} tasks')

        if len(wf_ids):
            logger.warning(f'Deletes {len(wf_ids)} workflows')
            if not self.dry_run:
                res = self.workflow_collection.delete_many({
                    '_id': {
                        '$in': wf_ids
                    }
                })
                logger.warning(f'Deleted {res.deleted_count} workflows')

    def get_orphaned_workflows(
        self,
        app_id: str,
        current_wf_ids: list[str],
        workflows_types: list[str],
        age_threshold_sec: int
    ) -> list[dict]:
        threshold_date_utc = datetime.utcnow() - timedelta(seconds=age_threshold_sec)
        cursor = self.workflow_collection.find({
            'app_id': app_id,
            'name': {
                '$in': workflows_types
            },
            'created_at': {
                '$lte': threshold_date_utc
            },
            '_id': {
                '$nin': current_wf_ids
            }
        })
        return list(cursor)


def purge_stale_workflows(app_id: str = config['app_id'],
                          workflow_types: list[str] = config['workflow']['purge']['types'],
                          age_threshold: int = config['workflow']['purge']['age_threshold_seconds'],
                          max_purge_count: int = config['workflow']['purge']['max_purge_count'],
                          dry_run=False):
    """
    Purge orphaned workflows and associated tasks from the result backend.
    
    @param app_id: app_id to purge workflows for
    @param workflow_types: list of workflow types to purge
    @param age_threshold: purge workflows older than this threshold (in seconds)
    @param max_purge_count: max number of workflows to purge
    @param dry_run: if True, do not delete workflows

    example usage: 
    
    python -m workers.scripts.purge_stale_workflows --app_id='bioloop-dev.sca.iu.edu' --workflow_types='["stage", "integrated"]' --age_threshold=86400 --max_purge_count=10 --dry_run
    """
    WorkflowPurgeManager(app_id, workflow_types, age_threshold, max_purge_count, dry_run).purge()


if __name__ == "__main__":
    fire.Fire(purge_stale_workflows)

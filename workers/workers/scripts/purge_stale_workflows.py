from datetime import datetime

import workers.api as api
from pymongo import MongoClient, DeleteOne
from pymongo.collection import Collection
from pymongo.cursor import Cursor
from pymongo.errors import BulkWriteError
from workers.config import config
from workers.config.celeryconfig import result_backend


class MongoConnection:
    WORKFLOW_COLLECTION = 'workflow_meta'
    TASK_COLLECTION = 'celery_taskmeta'

    def __init__(self):
        self.mongo_client = MongoClient(result_backend)
        self.celery_db = self.mongo_client['celery']
        self.workflow_collection = self.celery_db[self.WORKFLOW_COLLECTION]
        self.task_collection = self.celery_db[self.TASK_COLLECTION]

    def purge(self):
        task_delete_requests = []
        workflow_delete_requests = []

        app_workflows = api.get_all_workflows()
        app_workflow_ids = [wf['id'] for wf in app_workflows]

        orphaned_tasks_cursor = self.get_orphaned_tasks(config['app_id'], app_workflow_ids, config['workflows_to_purge'])
        orphaned_workflows = []
        for task in orphaned_tasks_cursor:
            print(f"added task {task['_id']} to list of tasks to be deleted")
            task_delete_requests.append(DeleteOne({'_id': task['_id']}))

            if task['workflow']['_id'] not in orphaned_workflows:
                orphaned_workflows.append(task['workflow']['_id'])

        for wf_id in orphaned_workflows:
            print(f"added workflow {wf_id} to list of workflows to be deleted")
            workflow_delete_requests.append(DeleteOne({'_id': wf_id}))

        print(f'Number of workflows to delete from Celery persistence: {len(workflow_delete_requests)}')
        print(f'Number of tasks to delete from Celery persistence: {len(task_delete_requests)}')

        bulk_delete(self.workflow_collection, workflow_delete_requests)
        bulk_delete(self.task_collection, task_delete_requests)

        print(f'Number of workflows in Celery persistence after deletion: {self.workflow_collection.count_documents({})}')
        print(f'Number of tasks in Celery persistence after deletion: {self.task_collection.count_documents({})}')

        orphaned_tasks_cursor.close()

    def get_orphaned_tasks(
        self,
        app_id: str,
        current_wf_ids: list[str],
        check_workflows_types: list[str],
        age_threshold_sec: int = config['workflow_purge_age_threshold']
    ) -> Cursor:
        return self.task_collection.aggregate([
            {
                '$match':
                    {
                        '$and': [
                            {'kwargs.app_id': app_id},
                            {'kwargs.workflow_id': {'$not': {'$in': current_wf_ids}}},
                            {'kwargs.step': {'$in': check_workflows_types}}
                        ]
                    }
            }, {
                '$lookup':
                    {
                        'from': self.WORKFLOW_COLLECTION,
                        'localField': "kwargs.workflow_id",
                        'foreignField': "_id",
                        'as': "workflows"
                    }
            }, {
                "$project": {
                    "workflow": {"$arrayElemAt": ["$workflows", 0]}
                }
            }, {
                "$set": {
                    "workflow.seconds_since_creation": {
                        '$dateDiff': {
                            'startDate': '$workflow.created_at',
                            'endDate': datetime.now(),
                            'unit': 'second'
                        }
                    }
                }
            }, {
                "$match": {
                    "workflow.seconds_since_creation": {"$gt": age_threshold_sec}
                }
            }
        ])


def bulk_delete(collection: Collection, delete_requests: [DeleteOne]) -> None:
    """
    Deletes the provided Documents from the provided Collection
    :param collection: The Collection from which Documents are to be deleted
    :param delete_requests: List containing DeleteOne objects that correspond to the Documents to be deleted
    """
    if len(delete_requests) > 0:
        # bulk_write() attempts to delete all requested documents, before reporting any errors
        try:
            collection.bulk_write(delete_requests, ordered=False)
        except BulkWriteError as bwe:
            print(bwe.details)


def main():
    mongo_connection = MongoConnection()
    mongo_connection.purge()


if __name__ == "__main__":
    main()

from datetime import datetime

import workers.api as api
from pymongo import MongoClient, DeleteOne
from pymongo.cursor import Cursor
from workers.config import config
from workers.config.celeryconfig import result_backend


class MongoConnection:
    WORKFLOW_COLLECTION_NAME = 'workflow_meta'
    TASK_COLLECTION_NAME = 'celery_taskmeta'

    def __init__(self):
        self.mongo_client = MongoClient(result_backend)
        self.celery_db = self.mongo_client['celery']
        self.workflow_collection = self.celery_db[self.WORKFLOW_COLLECTION_NAME]
        self.task_collection = self.celery_db[self.TASK_COLLECTION_NAME]

    def purge(self):
        app_workflows = api.get_all_workflows()
        app_workflow_ids = [wf['id'] for wf in app_workflows]

        orphaned_tasks_cursor = self.get_orphaned_tasks(
            config['app_id'],
            app_workflow_ids,
            config['workflow']['workflows_to_purge']
        )

        orphaned_workflows = []
        for task in orphaned_tasks_cursor:
            if task['workflow']['_id'] not in orphaned_workflows:
                print(f"added workflow {task['workflow']['_id']} to list of workflows to be deleted")
                orphaned_workflows.append(task['workflow']['_id'])

        workflow_delete_ids = [wf_id for wf_id in orphaned_workflows]

        print(f'Number of workflows in Celery persistence before deletion: {self.workflow_collection.count_documents({})}')
        print(f'Number of workflows to delete from Celery persistence: {len(workflow_delete_ids)}')
        self.delete_workflows(workflow_delete_ids)
        print(f'Number of workflows in Celery persistence after deletion: {self.workflow_collection.count_documents({})}')

        orphaned_tasks_cursor.close()

    def get_orphaned_tasks(
        self,
        app_id: str,
        current_wf_ids: list[str],
        check_workflows_types: list[str],
        age_threshold_sec: int = config['workflow']['purge_threshold_seconds']
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
                        'from': self.WORKFLOW_COLLECTION_NAME,
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

    def delete_workflows(self, workflow_delete_ids: [str]) -> None:
        """
        Deletes matching workflows and their associated tasks
        :param workflow_delete_ids: List containing workflow ids that need to be deleted
        """
        delete_counter = 0
        for _id in workflow_delete_ids:
            if delete_counter < config['workflow']['max_purge_count'] - 1:
                print(f"deleting all tasks associated with workflow {_id}")
                for task in self.task_collection.find({'kwargs.workflow_id': _id}):
                    self.task_collection.delete_one({'_id': task['_id']})
                print(f"deleted all tasks associated with workflow {_id}")
                self.workflow_collection.delete_one({'_id': _id})

                delete_counter += 1


def main():
    mongo_connection = MongoConnection()
    mongo_connection.purge()


if __name__ == "__main__":
    main()

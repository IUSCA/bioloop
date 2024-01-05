from datetime import datetime
from pymongo import MongoClient, DeleteOne
from pymongo.collection import Collection
from pymongo.errors import BulkWriteError

from workers.config.celeryconfig import result_backend
from workers.config import config
import workers.api as api


def main():
    app_workflows = api.get_all_workflows()
    app_workflow_ids = [wf['id'] for wf in app_workflows]

    mongo_client = MongoClient(result_backend)
    celery_db = mongo_client['celery']
    workflow_collection = celery_db['workflow_meta']
    task_collection = celery_db['celery_taskmeta']

    wf_cursor = workflow_collection.find({})
    print(f'Current number of workflows in Celery persistence: {workflow_collection.count_documents({})}')

    task_cursor = task_collection.find({})
    print(f'Current number of tasks in Celery persistence: {task_collection.count_documents({})}')

    workflow_delete_requests = []
    task_delete_requests = []

    for wf in wf_cursor:
        if wf['_id'] not in app_workflow_ids and hours_since_workflow_creation(wf) > 24:
            print(f"added workflow {wf['_id']} to list of workflows to be deleted")
            workflow_delete_requests.append(DeleteOne({'_id': wf['_id']}))

    for task in task_cursor:
        if task['kwargs'] is not None:
            task_workflow_id = task['kwargs']['workflow_id']
            task_workflow = wf_cursor.find({"_id": task_workflow_id})[0]

            if (task['kwargs']['app_id'] == config['app_id'] and
                    hours_since_workflow_creation(task_workflow) > 24 and
                    task_workflow_id not in app_workflow_ids):
                print(f"added task {task['_id']} to list of tasks to be deleted")
                task_delete_requests.append(DeleteOne({'kwargs.workflow_id': task['kwargs']['workflow_id']}))

    print(f'Number of workflows to delete from Celery persistence: {len(workflow_delete_requests)}')
    print(f'Number of tasks to delete from Celery persistence: {len(task_delete_requests)}')

    bulk_delete(workflow_collection, workflow_delete_requests)
    bulk_delete(task_collection, task_delete_requests)

    print(f'Number of workflows in Celery persistence after deletion: {workflow_collection.count_documents({})}')
    print(f'Number of tasks in Celery persistence after deletion: {task_collection.count_documents({})}')

    wf_cursor.close()
    task_cursor.close()


def hours_since_workflow_creation(workflow):
    return (datetime.now() - workflow['created_at']).total_seconds() / 3600


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


if __name__ == "__main__":
    main()

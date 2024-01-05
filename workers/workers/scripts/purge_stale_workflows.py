from pymongo import MongoClient, DeleteOne
from pymongo.collection import Collection
from pymongo.errors import BulkWriteError

from workers.config.celeryconfig import result_backend
import workers.api as api


def main():
    app_workflows = api.get_all_workflows()
    app_workflow_ids = [wf['id'] for wf in app_workflows]
    print(app_workflow_ids)

    mongo_client = MongoClient(result_backend)
    celery_db = mongo_client['celery']
    workflow_collection = celery_db['workflow_meta']
    task_collection = celery_db['celery_taskmeta']

    wf_cursor = workflow_collection.find({})
    print(f'Current number of workflows: {workflow_collection.count_documents({})}')

    task_cursor = task_collection.find({})
    print(f'Current number of tasks: {task_collection.count_documents({})}')

    workflow_delete_requests = [DeleteOne({'_id': wf['_id']}) for wf in wf_cursor if wf['_id'] not in app_workflow_ids]
    task_delete_requests = [DeleteOne({'kwargs.workflow_id': task['kwargs']['workflow_id']}) for task in task_cursor if
                            task['kwargs'] is not None and task['kwargs']['workflow_id'] not in app_workflow_ids]
    print(task_delete_requests)

    print(f'Number of workflows to delete: {len(workflow_delete_requests)}')
    print(f'Number of tasks to delete: {len(task_delete_requests)}')

    bulk_delete(workflow_collection, workflow_delete_requests)
    bulk_delete(task_collection, task_delete_requests)

    print(f'Number of workflows after deletion: {workflow_collection.count_documents({})}')
    print(f'Number of tasks after deletion: {task_collection.count_documents({})}')

    wf_cursor.close()
    task_cursor.close()


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

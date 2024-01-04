from pymongo import MongoClient, DeleteOne
from pymongo.errors import BulkWriteError

from workers.config.celeryconfig import result_backend
import workers.api as api


def main():
    workflows = api.get_all_workflows()
    workflow_ids = [wf['id'] for wf in workflows]

    mongo_client = MongoClient(result_backend)
    workflow_meta_col = mongo_client['celery']['workflow_meta']

    wf_cursor = workflow_meta_col.find({})
    print(f'Number of workflows in Celery broker: {workflow_meta_col.count_documents({})}')

    delete_requests = [DeleteOne({'_id': wf['_id']}) for wf in wf_cursor if wf['_id'] not in workflow_ids]
    print(f'Number of workflows to delete: {len(delete_requests)}')

    # Will attempt to delete all requested documents, before reporting any errors
    try:
        workflow_meta_col.bulk_write(delete_requests, ordered=False)
    except BulkWriteError as bwe:
        print(bwe.details)

    print(f'Number of workflows after deletion: {workflow_meta_col.count_documents({})}')


if __name__ == "__main__":
    main()

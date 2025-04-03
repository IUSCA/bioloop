function createIndexesOnTasksCollection() {
    const collection = db.getCollection('celery_taskmeta');
    collection.createIndex({ "status": 1 });
    collection.createIndex({ "kwargs.app_id": 1 });
    collection.createIndex({ "kwargs.step": 1 });
}

function createIndexesOnWorkflowCollection() {
    const collection = db.getCollection('workflow_meta');
    collection.createIndex({ "_status": 1 });
    collection.createIndex({ "app_id": 1 });
}

createIndexesOnTasksCollection();
createIndexesOnWorkflowCollection();

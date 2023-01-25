from flask import Flask, request, jsonify, request

from celery_app import app as celery_app
from workflow import Workflow

app = Flask(__name__)
db = celery_app.backend.database
wf_col = db.get_collection('workflow_meta')


@app.route('/', methods=['GET'])
def get_all_workflows():
    include_task_details = bool(request.args.get('include_task_details', False))
    results = wf_col.find(projection=['_id'])
    response = []
    for res in results:
        workflow_id = res['_id']
        wf = Workflow(workflow_id=workflow_id)
        response.append(wf.get_embellished_workflow(include_task_details=include_task_details))
    return jsonify(response)


@app.route('/<workflow_id>', methods=['GET'])
def get_workflow(workflow_id):
    include_task_details = bool(request.args.get('include_task_details', False))
    wf = Workflow(celery_app=celery_app, workflow_id=workflow_id)
    return jsonify(wf.get_embellished_workflow(include_task_details=include_task_details))


@app.route('/', methods=['POST'])
def create_workflow():
    steps = request.json
    wf = Workflow(celery_app=celery_app, steps=steps)
    return jsonify({'workflow_id': wf.workflow.workflow_id})


@app.route('/<workflow_id>/pause', methods=['POST'])
def pause_workflow(workflow_id):
    wf = Workflow(celery_app=celery_app, workflow_id=workflow_id)
    wf.pause()
    return jsonify({})


@app.route('/<workflow_id>/resume', methods=['POST'])
def resume_workflow(workflow_id):
    wf = Workflow(celery_app=celery_app, workflow_id=workflow_id)
    wf.resume()
    return jsonify({})


app.run(debug=True)

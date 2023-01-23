import json
from flask import Flask, request, jsonify

from workflow import Workflow

app = Flask(__name__)


@app.route('/<workflow_id>', methods=['GET'])
def get_workflow(workflow_id):
    wf = Workflow(celery_app=celery_app, workflow_id=workflow_id)
    wf.workflow.status = wf.get_workflow_status()
    return jsonify(wf.workflow)


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

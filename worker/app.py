from datetime import datetime, date

from flask import Flask, request, jsonify, request
from flask.json.provider import DefaultJSONProvider

from celery_app import app as celery_app
from workflow import Workflow

# jsonify - serialize datetime objects into yyyy-mm-ddTHH:mm:ssssss
# https://stackoverflow.com/a/74618781/2580077
class UpdatedJSONProvider(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, date) or isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)

app = Flask(__name__)
app.json = UpdatedJSONProvider(app)
db = celery_app.backend.database
wf_col = db.get_collection('workflow_meta')

def get_boolean_query(request, name, default=False):
    return request.args.get(name, default, type=lambda v: v.lower() == 'true')

@app.route('/', methods=['GET'])
def get_all_workflows():
    last_task_run = get_boolean_query(request, 'last_task_run')
    prev_task_runs = get_boolean_query(request, 'prev_task_runs')
    results = wf_col.find(projection=['_id'])
    response = []
    for res in results:
        workflow_id = res['_id']
        wf = Workflow(celery_app=celery_app, workflow_id=workflow_id)
        response.append(wf.get_embellished_workflow(last_task_run=include_task_details, prev_task_runs=prev_task_runs))
    return jsonify(response)


@app.route('/<workflow_id>', methods=['GET'])
def get_workflow(workflow_id):
    last_task_run = get_boolean_query(request, 'last_task_run')
    prev_task_runs = get_boolean_query(request, 'prev_task_runs')
    wf = Workflow(celery_app=celery_app, workflow_id=workflow_id)
    return jsonify(wf.get_embellished_workflow(last_task_run=last_task_run, prev_task_runs=prev_task_runs))


@app.route('/', methods=['POST'])
def create_workflow():
    steps = request.json
    wf = Workflow(celery_app=celery_app, steps=steps)
    return jsonify({'workflow_id': wf.workflow.workflow_id})


@app.route('/<workflow_id>/pause', methods=['POST'])
def pause_workflow(workflow_id):
    wf = Workflow(celery_app=celery_app, workflow_id=workflow_id)
    status = wf.pause()
    return jsonify(status)


@app.route('/<workflow_id>/resume', methods=['POST'])
def resume_workflow(workflow_id):
    wf = Workflow(celery_app=celery_app, workflow_id=workflow_id)
    status = wf.resume()
    return jsonify(status)


if __name__ == "__main__":
    # Only for debugging while developing
    app.run(host="0.0.0.0", debug=True, port=5000)
    # app.run()

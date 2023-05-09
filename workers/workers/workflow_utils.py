from workers.config import config


def make_task_name(task_name):
    app_id = config['app_id']
    return f'{app_id}.{task_name}'


def get_wf_body(wf_name: str) -> dict:
    wf_body = config['workflow_registry'][wf_name]
    wf_body['name'] = wf_name
    wf_body['app_id'] = config['app_id']
    for step in wf_body['steps']:
        step['task'] = make_task_name(step['task'])
    return wf_body

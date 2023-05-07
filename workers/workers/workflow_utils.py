from workers.config import config


def make_task_name(task_name):
    project = config['project_FQDN']
    return f'{project}.{task_name}'


def get_wf_body(wf_name: str) -> dict:
    wf_body = config['workflow_registry'][wf_name]
    wf_body['name'] = wf_name
    wf_body['project'] = config['project_FQDN']
    for step in wf_body['steps']:
        step['task'] = make_task_name(step['task'])
    return wf_body

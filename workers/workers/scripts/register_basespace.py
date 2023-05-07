import argparse

from sca_rhythm import Workflow

import workers.api as api
from workers import utils
from workers.celery_app import app as celery_app  # TODO: no need to register tasks before


class BaseSpaceRegistration:
    def __init__(self):
        self.wf_body = utils.get_wf_body(wf_name='illumina_integrated')

    def register_candidate(self, project_name):
        print(f'registering {project_name}')
        wf = Workflow(celery_app=celery_app, **self.wf_body)
        dataset = {
            'name': project_name,
            'type': 'RAW_DATA',
            'workflow_id': wf.workflow['_id']
        }
        # HTTP POST
        created_dataset = api.create_dataset(dataset)
        wf.start(created_dataset['id'])


if __name__ == '__main__':
    # argument parser
    parser = argparse.ArgumentParser(
        description='Register a basespace project - kicks off a full workflow')
    parser.add_argument('project_name', type=str, help='Project Name')

    # Parse the command line arguments
    args = parser.parse_args()

    project_name = args.project_name

    reg = BaseSpaceRegistration()
    reg.register_candidate(project_name)

import argparse

import scaworkers.api as api
from scaworkers.celery_app import app as celery_app
from scaworkers.workflow import Workflow


class BaseSpaceRegistration:
    def __init__(self):
        self.steps = [
            {
                'name': 'download',
                'task': 'scaworkers.workers.download.download_illumina_dataset'
            },
            {
                'name': 'inspect',
                'task': 'scaworkers.workers.inspect.inspect_dataset'
            },
            {
                'name': 'archive',
                'task': 'scaworkers.workers.archive.archive_dataset'
            },
            {
                'name': 'stage',
                'task': 'scaworkers.workers.stage.stage_dataset'
            },
            {
                'name': 'validate',
                'task': 'scaworkers.workers.validate.validate_dataset'
            },
            {
                'name': 'generate_reports',
                'task': 'scaworkers.workers.report.generate'
            }
        ]

    def register_candidate(self, project_name):
        print(f'registering {project_name}')
        wf = Workflow(celery_app=celery_app, steps=self.steps)
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

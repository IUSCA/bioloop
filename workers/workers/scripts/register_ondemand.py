import argparse
import sys
from pathlib import Path

from sca_rhythm import Workflow

import workers.api as api
import workers.workflow_utils as wf_utils
from workers.celery_app import app as celery_app
from workers.config import config


class Registration:
    def __init__(self, dataset_type):
        self.dataset_type = dataset_type
        self.wf_body = wf_utils.get_wf_body(wf_name='integrated')

    def register_candidate(self, dataset_name, dataset_path):
        print(f'registering {self.dataset_type} {dataset_name}')
        wf = Workflow(celery_app=celery_app, **self.wf_body)
        dataset_payload = {
            'data': {
                'name': dataset_name,
                'type': self.dataset_type,
                'workflow_id': wf.workflow['_id'],
                'origin_path': dataset_path
            }
        }
        # HTTP POST
        created_dataset = api.create_dataset(dataset_payload)
        wf.start(created_dataset['id'])


if __name__ == '__main__':
    # argument parser
    parser = argparse.ArgumentParser(
        description='Register a dataset - kicks off a full workflow')
    parser.add_argument('dataset_name', type=str, help='Dataset Name')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('-r', '--raw-data', action='store_true', help="register raw_data dataset")
    group.add_argument('-d', '--data-product', action='store_true', help="register data_product dataset")

    # Parse the command line arguments
    args = parser.parse_args()
    dataset_type = 'RAW_DATA' if args.raw_data else 'DATA_PRODUCT'

    dataset_name = args.dataset_name
    dataset_path = Path(config['registration'][dataset_type]['source_dir']) / dataset_name

    if not dataset_path.exists():
        print(f'{dataset_path} does not exist')
        sys.exit(1)

    reg = Registration(dataset_type)
    reg.register_candidate(dataset_name, str(dataset_path))

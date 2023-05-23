import socket
import time
from datetime import datetime

from sca_rhythm import Workflow

import workers.api as api
import workers.illumina as illumina
import workers.workflow_utils as wf_utils
from workers.celery_app import app as celery_app  # TODO: no need to register tasks before
from workers.config import config


def get_registered_dataset_names():
    datasets = api.get_all_datasets(dataset_type='RAW_DATA')
    return [b['name'] for b in datasets]


def get_last_registered_dataset():
    datasets = api.get_all_datasets(dataset_type='RAW_DATA')
    datasets_sorted = sorted(datasets, key=lambda x: x['created_at'])
    return datasets_sorted[-1] if len(datasets_sorted) > 0 else None


class BaseSpaceRegistration:
    def __init__(self):
        self.host = socket.getfqdn()
        self.rejects = set(config['illumina']['registration']['rejects'])
        self.completed = set(get_registered_dataset_names())  # HTTP GET
        self.candidates = {}
        self.wf_body = wf_utils.get_wf_body(wf_name='illumina_integrated')

    def register(self):
        # mutating self.candidates inside the loop, so cannot use the standard for ... in ... syntax
        while len(self.candidates) > 0:
            project_name, project = next(iter(self.candidates.items()))
            if self.has_no_recent_activity(project):
                self.register_candidate(project_name)
                self.completed.add(project_name)
                self.candidates.pop(project_name, None)
        self.scan()

    @staticmethod
    def has_no_recent_activity(project):
        # has anything been modified in the project?
        delta = datetime.now() - project['DateModified']
        return delta.total_seconds() > config['illumina']['registration']['recency_threshold']

    def scan(self):
        latest_project = self.get_latest_project()
        print('latest_project', latest_project)
        if latest_project is not None:
            self.candidates[latest_project['Name']] = latest_project

    def get_latest_project(self):
        """
        From the output of "bs list project", find a project that is
        - not in the rejected list
        - not yet registered
        - modified after the last registered project
        - size greater than "minimum_project_size"

        transforms:
        - if the name ends with PL, cut out PL
        - if there are two projects with same name after transformation, take the larger

        If there are multiple projects satisfying the above conditions, take the last modified
        :return:
        """
        last_registration_date = (get_last_registered_dataset() or {}).get('created_at', datetime(1970, 1, 1))

        projects = illumina.get_projects()
        # if the name ends with PL, cut out PL
        for project in projects:
            if project['Name'].endswith('PL'):
                project['Name'] = project['Name'][:-2]

        projects = [p for p in projects if all([
            p['Name'] not in self.rejects,
            p['Name'] not in self.completed,
            p['TotalSize'] >= config['illumina']['registration']['minimum_project_size'],
            p['DateModified'] > last_registration_date
        ])]

        # if there are two projects with same name after transformation, take the larger
        projects_dict = {}
        for p in projects:
            if p['Name'] not in projects_dict:
                projects_dict[p['Name']] = p
            else:
                another_p = projects_dict[p['Name']]
                projects_dict[p['Name']] = max(p, another_p, key=lambda x: x['TotalSize'])
        projects = projects_dict.values()

        projects = sorted(projects, key=lambda x: x['DateModified'])

        if len(projects) > 0:
            return projects[-1]
        else:
            return None

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
    bs_reg = BaseSpaceRegistration()

    print('starting register worker')
    while True:
        bs_reg.register()

        sleep_duration = config['illumina']['registration']['wait_between_scans']
        print(f'sleeping for {sleep_duration} seconds')
        time.sleep(sleep_duration)

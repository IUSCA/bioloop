import socket
import time
from pathlib import Path
from datetime import datetime

import scaworkers.api as api
from scaworkers.celery_app import app as celery_app
from scaworkers.config import config
from scaworkers.workflow import Workflow
import scaworkers.illumina as illumina


def get_registered_batch_paths():
    batches = api.get_all_batches()
    return [b['origin_path'] for b in batches]


def get_registered_batch_names():
    batches = api.get_all_batches()
    return [b['name'] for b in batches]


class Registration:
    def __init__(self):
        self.host = socket.getfqdn()
        self.source_dirs = set(Path(sd).resolve() for sd in config['registration']['source_dirs'] if Path(sd).exists())
        self.rejects = set(config['registration']['rejects'])
        self.completed = set(get_registered_batch_paths())  # HTTP GET
        self.candidates = set()
        self.steps = [
            {
                'name': 'inspect',
                'task': 'scaworkers.workers.inspect.inspect_batch'
            },
            {
                'name': 'archive',
                'task': 'scaworkers.workers.archive.archive_batch'
            },
            {
                'name': 'stage',
                'task': 'scaworkers.workers.stage.stage_batch'
            },
            {
                'name': 'validate',
                'task': 'scaworkers.workers.validate.validate_batch'
            }
        ]

    def register(self):
        while len(self.candidates) > 0:
            candidate = next(iter(self.candidates))
            if self.has_no_recent_activity(candidate):
                self.register_candidate(candidate)
                self.completed.add(str(candidate))
                self.candidates.remove(candidate)

        sleep_duration = config['registration']['wait_between_scans']
        print(f'sleeping for {sleep_duration} seconds')
        time.sleep(sleep_duration)
        self.scan()

    @staticmethod
    def has_no_recent_activity(dir_path):
        # has anything been modified in the specified directory recently?
        last_update_time = max([p.stat().st_mtime for p in dir_path.iterdir()], default=time.time())
        return time.time() - last_update_time > config['registration']['recency_threshold']

    def scan(self):
        for source_dir in self.source_dirs:
            for p in source_dir.iterdir():
                if p.is_dir() and (p.name not in self.rejects) and (str(p) not in self.completed):
                    print(f'found new candidate: {p}')
                    self.candidates.add(p)

    def register_candidate(self, candidate):
        print(f'registering {candidate}')
        wf = Workflow(celery_app=celery_app, steps=self.steps)
        batch = {
            'name': candidate.name,
            'origin_path': str(candidate.resolve()),
            'workflow_id': wf.workflow['_id']
        }
        # HTTP POST
        created_batch = api.create_batch(batch)
        wf.start(created_batch['id'])


class BaseSpaceRegistration:
    def __init__(self):
        self.host = socket.getfqdn()
        self.rejects = set(config['illumina']['registration']['rejects'])
        self.completed = set(get_registered_batch_names())  # HTTP GET
        self.candidates = {}
        self.steps = [
            {
                'name': 'download',
                'task': 'scaworkers.workers.download.download_illumina_batch'
            },
            {
                'name': 'inspect',
                'task': 'scaworkers.workers.inspect.inspect_batch'
            },
            {
                'name': 'archive',
                'task': 'scaworkers.workers.archive.archive_batch'
            },
            {
                'name': 'stage',
                'task': 'scaworkers.workers.stage.stage_batch'
            },
            {
                'name': 'validate',
                'task': 'scaworkers.workers.validate.validate_batch'
            }
        ]

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
        for project in illumina.get_projects():
            project_name, total_size = project['Name'], project['TotalSize']
            if project_name not in self.rejects and project_name not in self.completed and total_size > 0:
                print(f'found new candidate: {project_name}')
                self.candidates[project_name] = project

    def register_candidate(self, project_name):
        print(f'registering {project_name}')
        wf = Workflow(celery_app=celery_app, steps=self.steps)
        batch = {
            'name': project_name,
            'workflow_id': wf.workflow['_id']
        }
        # HTTP POST
        created_batch = api.create_batch(batch)
        wf.start(created_batch['id'])


if __name__ == '__main__':
    r = Registration()
    bs_reg = BaseSpaceRegistration()

    while True:
        r.register()
        bs_reg.register()

        sleep_duration = config['registration']['wait_between_scans']
        print(f'sleeping for {sleep_duration} seconds')
        time.sleep(sleep_duration)

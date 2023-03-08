import socket
import time
from pathlib import Path

import scaworkers.api as api
from scaworkers.celery_app import app as celery_app
from scaworkers.config import config
from scaworkers.workflow import Workflow
import scaworkers.illumina as illumina


def get_registered_batch_paths():
    batches = api.get_all_batches()
    return [b['origin_path'] for b in batches]


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
        while True:
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

    def has_no_recent_activity(self, dir_path):
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


class BasespaceRegistration:
    def __init__(self):
        self.host = socket.getfqdn()
        self.rejects = set(config['illumina']['registration']['rejects'])
        self.completed = {} #set(get_registered_batch_paths())  # HTTP GET
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
        while True:
            # mutating self.condidates inside the loop, so cannot use the standard for ... in ... syntax
            while len(self.candidates) > 0:
                name, project = next(iter(self.candidates.items()))
                if self.has_no_recent_activity(project):
                    self.register_candidate(project)
                    self.completed[name] = project
                    self.candidates.pop(name, None)

            sleep_duration = config['illumina']['registration']['wait_between_scans']
            print(f'sleeping for {sleep_duration} seconds')
            time.sleep(sleep_duration)
            self.scan()

    def has_no_recent_activity(self, project):
        # has anything been modified in the project?
        delta = datetime.now() - project['DateModified']
        return delta.total_seconds() > config['illumina']['registration']['recency_threshold']


    def scan(self):
        for project in illumina.get_projects():
            if  (project['Name'] not in self.rejects) and (project['Name'] not in self.completed) and (project['TotalSize'] > 0):
                print(f'found new candidate: {project["Name"]}')
                self.candidates[project['Name']] = project

    def register_candidate(self, candidate):
        print(f'registering {candidate}')
        # wf = Workflow(celery_app=celery_app, steps=self.steps)
        # batch = {
        #     'name': candidate['Name'],
        #     'origin_path': candidate['Id'],
        #     'workflow_id': wf.workflow['_id']
        # }
        # # HTTP POST
        # created_batch = api.create_batch(batch)
        # wf.start(created_batch['id'])

if __name__ == '__main__':
    r = Registration()
    print('start registering:', r.source_dirs)
    r.register()
    

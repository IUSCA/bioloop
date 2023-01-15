import socket
import time
from datetime import datetime

from api import APIServerSession


def has_recent_activity(dir_path, recency_threshold=3600):
    # has anything been modified in the specified directory recently?
    assert dir_path.is_dir()
    last_update_time = max([p.stat().st_mtime for p in dir_path.iterdir()], default=time.time())
    return time.time() - last_update_time > recency_threshold


class Registration:
    def __init__(self):
        self.host = socket.getfqdn()
        self.source_dirs = []   # from config
        self.completed = set()  # HTTP GET
        self.candidates = set()
        self.config = {
            'source_dirs': set(),
            'rejects': {'.snapshots'},
            'wait_between_scans': 5
        }

    def register(self):
        while True:
            if self.candidates:
                for candidate in self.candidates:
                    if not has_recent_activity(candidate):
                        self.register_candidate(candidate)
                        self.completed.add(candidate)
                        self.candidates.remove(candidate)
            else:
                time.sleep(self.config['wait_between_scans'])
                self.scan()

    def scan(self):
        for source_dir in self.config['source_dirs']:
            for p in source_dir.iterdir():
                if (p.name not in self.config['REJECTS']) and p.is_dir() and (p.name not in self.completed):
                    self.candidates.add(p)

    def register_candidate(self, candidate):
        events = [{
            'stamp': datetime.fromtimestamp(candidate.stat().st_ctime).strftime("%Y-%m-%dT%H:%M:%S.%f3Z"),
            'description': 'registration - first noticed'
        }, {
            'stamp': datetime.now().strftime("%Y-%m-%dT%H:%M:%S.%f3Z"),
            'description': 'registration - ready for processing'
        }]
        metadata = {
            'source_node': self.host,
            'name': candidate.name,
            'paths.origin': str(candidate.resolve()),
            'directories': 0,
            'files': 0,
            'cbcls': 0,
            'size': 0,
            'checksums': [],
            'events': events
        }
        # HTTP POST
        with APIServerSession() as s:
            s.post('/registrations', metadata)

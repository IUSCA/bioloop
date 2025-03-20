import os

from workers.cmd import total_size
from .metrics_collector import MetricsCollector
from workers.config import config


class GCPMetricsCollector(MetricsCollector):
    def calculate_usage(self, path_getter):
        total_usage = 0
        for dataset_type in config['DATASET_TYPES']:
            paths = path_getter(dataset_type)
            for path in paths:
                if os.path.exists(path):
                    total_usage += total_size(path)
        return total_usage

    def get_registration_paths(self, dataset_type):
        if dataset_type in config['registration']:
            dataset_config = config['registration'][dataset_type]
            if 'source_dir' in dataset_config:
                return [dataset_config['source_dir']]
        return []

    def get_archived_paths(self, dataset_type):
        if dataset_type in config['paths']:
            dataset_config = config['paths'][dataset_type]
            if 'archive' in dataset_config:
                return [dataset_config['archive']]
        return []

    def get_staged_paths(self, dataset_type):
        paths = []
        if dataset_type in config['paths']:
            dataset_config = config['paths'][dataset_type]
            if 'stage' in dataset_config:
                paths.append(dataset_config['stage'])
            if 'bundle' in dataset_config and 'stage' in dataset_config['bundle']:
                paths.append(dataset_config['bundle']['stage'])
        return paths

    def get_registration_usage(self):
        return self.calculate_usage(self.get_registration_paths)

    def get_archived_usage(self):
        return self.calculate_usage(self.get_archived_paths)

    def get_staged_usage(self):
        return self.calculate_usage(self.get_staged_paths)

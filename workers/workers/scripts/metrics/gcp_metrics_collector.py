import os

from workers.cmd import total_size
from .metrics_collector import MetricsCollector
from workers.config import config


PROJECT_ID = config['gcp']['project_id']
ZONE = config['gcp']['zone']
INSTANCE_NAME = config['gcp']['instance_name']


class GCPMetricsCollector(MetricsCollector):
    def get_registration_metrics(self) -> List[Dict]:
        metrics = []

        registration_usage = get_registration_usage()
        archived_usage = get_archived_usage()
        staged_usage = get_staged_usage()

        metrics.extend(
            [
                {
                    'measurement': 'Registration',
                    'subject': self.hostname(),
                    'usage': registration_usage,
                    'tags': []
                }
            ]
        )
        metrics.extend(
            [
                {
                    'measurement': 'archived',
                    'subject': self.hostname(),
                    'usage': archived_usage,
                    'tags': []
                }
            ]
        )
        metrics.extend(
            [
                {
                    'measurement': 'staged',
                    'subject': self.hostname(),
                    'usage': staged_usage,
                    'tags': []
                }
            ]
        )

        return metrics


def get_staged_usage():
    total_usage = 0
    for dataset_type in config['DATASET_TYPES']:
        if dataset_type in config['paths']:
            dataset_config = config['paths'][dataset_type]
            if 'stage' in dataset_config:
                stage_path = dataset_config['stage']
                if os.path.exists(stage_path):
                    total_usage += total_size(stage_path)
            if 'bundle' in dataset_config and 'stage' in dataset_config['bundle']:
                bundle_stage_path = dataset_config['bundle']['stage']
                if os.path.exists(bundle_stage_path):
                    total_usage += total_size(bundle_stage_path)
    return total_usage


def get_registration_usage():
    total_usage = 0
    for dataset_type in config['DATASET_TYPES']:
        if dataset_type in config['registration']:
            dataset_config = config['registration'][dataset_type]
            if 'source_dir' in dataset_config:
                registration_path = dataset_config['source_dir']
                if os.path.exists(registration_path):
                    total_usage += total_size(registration_path)
    return total_usage


def get_archived_usage():
    total_usage = 0
    for dataset_type in config['DATASET_TYPES']:
        if dataset_type in config['paths']:
            dataset_config = config['paths'][dataset_type]
            if 'archive' in dataset_config:
                archive_path = dataset_config['stage']
                if os.path.exists(archive_path):
                    total_usage += total_size(archive_path)
    return total_usage

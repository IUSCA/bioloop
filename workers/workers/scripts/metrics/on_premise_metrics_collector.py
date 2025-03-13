import socket
import shutil
import os

from .metrics_collector import MetricsCollector
from workers.config import config
from workers import hpfs


def get_directory_size(path):
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            total_size += os.path.getsize(fp)
    return total_size


class OnPremiseMetricsCollector(MetricsCollector):
    def get_hostname(self):
        return socket.getfqdn()

    def get_staging_space_usage(self):
        return hpfs.get_slate_scratch_usage(username=config['service_user'])

    def get_registration_spaces_usage(self):
        hostname = self.get_hostname()
        metrics = []

        origin_spaces = [
            ('raw_data', config['registration']['RAW_DATA']['source_dir']),
            ('data_product', config['registration']['DATA_PRODUCT']['source_dir'])
        ]

        total_used = 0
        for space_name, space_path in origin_spaces:
            if os.path.exists(space_path):
                used = get_directory_size(space_path)
                total_used += used

        metrics.append({
            'measurement': 'origin space',
            'subject': hostname,
            'usage': total_used,
            'tags': []
        })

        return metrics

    def get_storage_spaces_usage(self):
        hostname = self.get_hostname()
        metrics = []

        # Get metrics for archival (SDA)
        disk_usages = hpfs.get_disk_usages()
        sda_metrics = [
            {
                'measurement': d['Filesystem'],
                'subject': hostname,
                'usage': d['usage'],
                'limit': d['quota'],
                'tags': []
            }
            for d in disk_usages if d['Filesystem'] in ['sda']
        ]
        metrics.extend(sda_metrics)

        # Get metrics for temporary storage (Slate-Scratch)
        scratch_usage = self.get_staging_space_usage()
        scratch_metrics = [
            {
                'measurement': d['Filesystem'],
                'subject': hostname,
                'usage': d['usage'],
                'limit': d['limit'],
                'tags': []
            }
            for d in scratch_usage
        ]
        metrics.extend(scratch_metrics)

        return metrics

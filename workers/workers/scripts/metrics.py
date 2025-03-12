"""
Run by cron, collects disk usage information and sends to the API
"""

import socket
import os
import shutil

from workers import api
from workers import hpfs
from workers.config import config


def get_directory_size(path):
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            total_size += os.path.getsize(fp)
    return total_size


def main():
    metrics = []
    hostname = socket.getfqdn()

    disk_usages = hpfs.get_disk_usages()

    metrics.extend(
        [
            {
                'measurement': d['Filesystem'],
                'subject': hostname,
                'usage': d['usage'],
                'limit': d['quota'],
                'tags': []
            }
            for d in disk_usages if d['Filesystem'] in ['sda']
        ]
    )

    scratch_usage = hpfs.get_slate_scratch_usage(username=config['service_user'])

    metrics.extend(
        [
            {
                'measurement': d['Filesystem'],
                'subject': hostname,
                'usage': d['usage'],
                'limit': d['limit'],
                'tags': []
            }
            for d in scratch_usage
        ]
    )

    registration_metrics = get_registration_metrics()

    metrics.extend([registration_metrics['origin_space']])

    # print(metrics)
    print("sending registration space metrics")

    api.send_metrics(metrics)


def get_registration_metrics():
    raw_data_archival_path = config['registration']['RAW_DATA']['source_dir']
    # data_product_archival_path = config['registration']['DATA_PRODUCT']['source_dir']

    metrics = {}
    hostname = socket.getfqdn()

    # Get metrics for raw_data_archival_path
    used = get_directory_size(raw_data_archival_path)

    # print(f"used space: {used}")
    # print(f"hostname: {hostname}")
    # print(f"raw_data_archival_path: {raw_data_archival_path}")

    metrics['origin_space'] = {
        'measurement': 'origin_space',
        'subject': hostname,
        'usage': used,
        'limit': None,
        'tags': []
    }

    return metrics

if __name__ == '__main__':
    main()

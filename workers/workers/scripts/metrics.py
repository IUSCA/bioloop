"""
Run by cron, collects disk usage information and sends to the API
"""

import socket
import os
import shutil

from workers import api
from workers import hpfs
from workers.config import config


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

    # print(metrics)
    api.send_metrics(metrics)


def persist_registration_metrics():
    raw_data_archival_path = config['registration']['RAW_DATA']['source_dir']
    data_product_archival_path = config['registration']['DATA_PRODUCT']['source_dir']

    metrics = []
    hostname = socket.getfqdn()

    # Get metrics for raw_data_archival_path
    total, used, free = shutil.disk_usage(raw_data_archival_path)

    metrics.append({
        'measurement': 'origin_space',
        'subject': hostname,
        'usage': used,
        'limit': total,
        'tags': []
    })

    # Get metrics for data_product_archival_path
    total, used, free = shutil.disk_usage(data_product_archival_path)

    metrics.append({
        'measurement': 'data_product_archival',
        'subject': hostname,
        'usage': used,
        'limit': total,
        'free': free,
        'tags': []
    })

    # Send metrics to API
    api.send_metrics(metrics)

if __name__ == '__main__':
    main()

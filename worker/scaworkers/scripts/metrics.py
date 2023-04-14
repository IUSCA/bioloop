"""
Run by cron, collects disk usage information and sends to the API
"""

from scaworkers import hpfs
from scaworkers import api
from scaworkers.config import config

import socket


def main():
    metrics = []
    tags = [{'hostname': socket.getfqdn()}]

    disk_usages = hpfs.get_disk_usages()

    metrics.extend(
        [
            {
                'measurement': d['Filesystem'],
                'fields': [{'usage': d['usage']}, {'limit': d['quota']}],
                'tags': tags
            }
            for d in disk_usages if d['Filesystem'] in ['sda']
        ]
    )

    scratch_usage = hpfs.get_slate_scratch_usage(username=config['service_user'])

    metrics.extend(
        [
            {
                'measurement': d['Filesystem'],
                'fields': [{'usage': d['usage']}, {'limit': d['limit']}],
                'tags': tags
            }
            for d in scratch_usage
        ]
    )

    api.send_metrics(metrics)

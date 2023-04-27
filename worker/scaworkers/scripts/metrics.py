"""
Run by cron, collects disk usage information and sends to the API
"""

from scaworkers import hpfs
from scaworkers import api
from scaworkers.config import config

import socket


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
    

if __name__=='__main__':
    main()

from .metrics_collector import MetricsCollector
from workers.config import config
from workers import hpfs


class OnPremiseMetricsCollector(MetricsCollector):
    def get_registration_metrics(self) -> list[dict]:
        print("Getting registration metrics on On Premise")

        metrics = []

        disk_usages = hpfs.get_disk_usages()

        metrics.extend(
            [
                {
                    'measurement': d['Filesystem'],
                    'subject': self.hostname,
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
                    'subject': self.hostname,
                    'usage': d['usage'],
                    'limit': d['limit'],
                    'tags': []
                }
                for d in scratch_usage
            ]
        )

        return metrics

"""
Run by cron, collects disk usage information and sends to the API
"""

from workers import api
from workers.config import config
from .metrics import OnPremiseMetricsCollector
from .metrics import GCPMetricsCollector


def get_collector():
    environment = config.get('environment', 'on_premise')
    if environment == 'on_premise':
        return OnPremiseMetricsCollector()
    elif environment == 'gcp':
        return GCPMetricsCollector()
    else:
        raise ValueError(f"Unsupported environment: {environment}")


def main():
    collector = get_collector()
    metrics: List[Dict] = collector.get_registration_metrics()

    # print(metrics)
    api.send_metrics(metrics)


if __name__ == '__main__':
    main()

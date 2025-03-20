"""
Run by cron, collects disk usage information and sends to the API
"""

from workers import api
from workers.config import config
from .on_premise_metrics_collector import OnPremiseMetricsCollector
from .gcp_metrics_collector import GCPMetricsCollector


def get_collector():
    environment = config.get('environment', 'on_premise')
    print(f"Using {environment} metrics collector")

    if environment == 'on_premise':
        return OnPremiseMetricsCollector()
    elif environment == 'gcp':
        return GCPMetricsCollector()
    else:
        raise ValueError(f"Unsupported environment: {environment}")


def main():
    collector = get_collector()
    metrics: list[dict] = collector.get_registration_metrics()

    print("Metrics:")
    print(metrics)

    api.send_metrics(metrics)


if __name__ == '__main__':
    main()

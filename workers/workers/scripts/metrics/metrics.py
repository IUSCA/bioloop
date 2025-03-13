from workers.config import config
from workers.api import api
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


def collect_and_send_metrics():
    collector = get_collector()

    metrics = []

    # Usage of storage spaces, like the archival space, or the staging space
    storage_spaces_usage = collector.get_storage_spaces_usage()
    # Usage of the spaces involved in the registration process, like the origin space
    registration_spaces_usage = collector.get_registration_spaces_usage()

    metrics.extend(storage_spaces_usage)
    metrics.extend(registration_spaces_usage)

    print("Sending registration space metrics")
    api.send_metrics(metrics)


if __name__ == "__main__":
    collect_and_send_metrics()

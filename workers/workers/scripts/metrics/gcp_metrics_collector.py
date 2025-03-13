from google.cloud import storage
from google.cloud import compute_v1
from .metrics_collector import MetricsCollector
from workers.config import config


PROJECT_ID = config['gcp']['project_id']
ZONE = config['gcp']['zone']
INSTANCE_NAME = config['gcp']['instance_name']


class GCPMetricsCollector(MetricsCollector):
    def __init__(self):
        self.storage_client = storage.Client()
        self.instance_client = compute_v1.InstancesClient()
        self.instance = self.instance_client.get(
            project=PROJECT_ID,
            zone=ZONE,
            instance=INSTANCE_NAME
        )

    def get_hostname(self):
        return self.instance.name

    def get_disk_usages(self):
        metrics = []
        for disk in self.instance.disks:
            disk_info = self.instance_client.get_disk(
                project=PROJECT_ID,
                zone=ZONE,
                # get disk name from the full URL of the disk resource
                disk=disk.source.split('/')[-1]
            )
            # todo - filter only the disk usages that are needed
            metrics.append({
                'Filesystem': disk.device_name,
                'usage': disk_info.used_gb * 1024 * 1024 * 1024,
                'quota': disk_info.size_gb * 1024 * 1024 * 1024,
            })
        return metrics

    def get_staging_space_usage(self):
        bucket_name = config['gcp']['buckets']['staging']
        bucket = self.storage_client.get_bucket(bucket_name)
        blobs = bucket.list_blobs()

        total_size = sum(blob.size for blob in blobs)
        quota = bucket.storage_class_size_limit or float('inf')

        return [{
            'Filesystem': f'gs://{bucket_name}',
            'subject': self.get_hostname(),
            'usage': total_size,
            'limit': quota,
            'tags': []
        }]

    def get_registration_spaces_usage(self):
        hostname = self.get_hostname()
        metrics = []

        bucket_name = config['gcp']['registration']['bucket']
        origin_spaces = [
            ('raw_data', config['registration']['RAW_DATA']['source_dir']),
            ('data_product', config['registration']['DATA_PRODUCT']['source_dir'])
        ]

        bucket = self.storage_client.get_bucket(bucket_name)
        quota = bucket.storage_class_size_limit or float('inf')

        total_used = 0
        for space_name, source_dir in origin_spaces:
            blobs = bucket.list_blobs(prefix=source_dir)
            used = sum(blob.size for blob in blobs)
            total_used += used

        # todo - add staging space to this
        metrics.append({
            'measurement': 'origin space',
            'subject': hostname,
            'usage': total_used,
            'limit': quota,
            'tags': [],
        })

        return metrics

    def get_storage_spaces_usage(self):


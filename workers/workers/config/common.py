import datetime
import os
import urllib.parse

from dotenv import load_dotenv

load_dotenv()  # take environment variables from .env.
YEAR = datetime.datetime.now().year
APP_API_TOKEN = os.environ['APP_API_TOKEN']

QUEUE_URL = os.environ['QUEUE_URL']
QUEUE_USER = os.environ['QUEUE_USER']
QUEUE_PASSWORD = os.environ['QUEUE_PASS']

MONGO_HOST = os.environ['MONGO_HOST']
MONGO_PORT = os.environ['MONGO_PORT']
MONGO_DB = os.environ['MONGO_DB']
MONGO_AUTH_SOURCE = os.environ['MONGO_AUTH_SOURCE']
MONGO_USER = os.environ['MONGO_USER']
MONGO_PASSWORD = os.environ['MONGO_PASS']

ALIAS_SALT = os.environ['ALIAS_SALT']

ONE_HOUR = 60 * 60
# ONE_GIGABYTE = 1024 * 1024 * 1024
FIVE_MINUTES = 5 * 60

config = {
    'app_id': 'bioloop-dev.sca.iu.edu',
    'genome_file_types': ['.cbcl', '.bcl', '.bcl.gz', '.bgzf', '.fastq.gz', '.bam', '.bam.bai', '.vcf.gz',
                          '.vcf.gz.tbi', '.vcf'],
    'api': {
        'base_url': 'http://api:3030',
        'auth_token': APP_API_TOKEN,
        'conn_timeout': 5,  # seconds
        'read_timeout': 30  # seconds
    },
    'paths': {
        'scratch': '/data/scratch',
        'RAW_DATA': {
            'archive': f'/data/archive/{YEAR}/raw_data',
            'stage': '/data/stage/raw_data',
            'bundle': {
                'generate': '/data/bundles/raw_data',
                'stage': '/data/bundles/raw_data',
            },
            'qc': '/data/qc'
        },
        'DATA_PRODUCT': {
            'archive': f'/data/archive/{YEAR}/data_products',
            'stage': '/data/stage/data_products',
            'bundle': {
                'generate': '/data/bundles/data_products',
                'stage': '/data/bundles/data_products',
            },
        },
        'download_dir': '/data/downloads',
        'root': '/data'
    },
    'registration': {
        'RAW_DATA': {
            'source_dir': '/data/source/raw_data',
            'rejects': ['.snapshots'],
        },
        'DATA_PRODUCT': {
            'source_dir': '/data/source/data_products',
            'rejects': ['.snapshots'],
        },
        'recency_threshold_seconds': 60, # 1 minute
        # 'minimum_dataset_size': ONE_GIGABYTE,
        'wait_between_stability_checks_seconds': 10, # seconds
        'poll_interval_seconds': 10,
        'full_scan_every_n_scans': 90  # every 90th scan will be a full scan / full scan every 15 minutes
    },
    'service_user': 'bioloopuser',
    'stage': {
        'purge': {
            'days_to_live': 20,
            'max_purges': 10
        },
        'alias_salt': ALIAS_SALT
    },
    'workflow_registry': {
        'stage': {
            'steps': [
                {
                    'name': 'stage',
                    'task': 'stage_dataset'
                },
                {
                    'name': 'validate',
                    'task': 'validate_dataset'
                },
                {
                    'name': 'setup_download',
                    'task': 'setup_dataset_download'
                }
            ]
        },
        'integrated': {
            'steps': [
                {
                    'name': 'await stability',
                    'task': 'await_stability'
                },
                {
                    'name': 'inspect',
                    'task': 'inspect_dataset'
                },
                {
                    'name': 'archive',
                    'task': 'archive_dataset'
                },
                {
                    'name': 'stage',
                    'task': 'stage_dataset'
                },
                {
                    'name': 'validate',
                    'task': 'validate_dataset'
                },
                {
                    'name': 'setup_download',
                    'task': 'setup_dataset_download'
                }
            ]
        },
        'process_dataset_upload': {
            'steps': [
                {
                    'name': 'Process Dataset Upload',
                    'task': 'process_dataset_upload'
                }
            ]
        },
        'cancel_dataset_upload': {
            'steps': [
                {
                    'name': 'Cancel Dataset Upload',
                    'task': 'cancel_dataset_upload'
                }
            ]
        }
    },
    'celery': {
        'queue': {
            'url': QUEUE_URL,
            'username': QUEUE_USER,
            'password': QUEUE_PASSWORD
        },
        'mongo': {
            'uri': f'mongodb://{MONGO_USER}:{urllib.parse.quote(MONGO_PASSWORD)}@{MONGO_HOST}:{MONGO_PORT}/{MONGO_DB}?authSource={MONGO_AUTH_SOURCE}',
        }
    },
    'email': {
        'from_addr': 'scauser@iu.edu',
        'sendmail_path': '/usr/sbin/sendmail'
    },
    'workflow': {
        'purge': {
            'types': ['integrated', 'stage', 'delete'],
            'age_threshold_seconds': 86400,
            'max_purge_count': 10
        }
    },
    'inspect': {
        'file_metadata_batch_size': 25000
    },
    'storage_backend': 'fs'
}

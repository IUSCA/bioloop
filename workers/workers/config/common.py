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
ONE_GIGABYTE = 1024 * 1024 * 1024
FIVE_MINUTES = 5 * 60

config = {
    'app_id': 'bioloop-dev.sca.iu.edu',
    'genome_file_types': ['.cbcl', '.bcl', '.bcl.gz', '.bgzf', '.fastq.gz', '.bam', '.bam.bai', '.vcf.gz',
                          '.vcf.gz.tbi', '.vcf'],
    'api': {
        'base_url': 'http://localhost:3030',
        'auth_token': APP_API_TOKEN,
        'conn_timeout': 5,  # seconds
        'read_timeout': 30  # seconds
    },
    'dataset_types': {
        'RAW_DATA': 'RAW_DATA',
        'DATA_PRODUCT': 'DATA_PRODUCT',
    },
    'paths': {
        'scratch': '/path/to/scratch',
        'RAW_DATA': {
            'archive': f'development/{YEAR}/raw_data',
            'stage': '/path/to/staged/raw_data',
            'bundle': {
                'generate': '/path/for/raw_data/bundle/generation',
                'stage': '/path/for/raw_data/bundle/staging',
            },
            'qc': '/path/to/qc'
        },
        'DATA_PRODUCT': {
            'upload': '/path/to/data_product/upload',
            'upload_destination': '/path/to/data_product/upload/destination',
            'archive': f'development/{YEAR}/data_products',
            'stage': '/path/to/staged/data_products',
            'bundle': {
                'generate': '/path/for/data_products/bundle/generation',
                'stage': '/path/for/data_products/bundle/staging',
            },
        },
        'download_dir': '/path/to/download_dir',
        'root': '/path/to/root'
    },
    'registration': {
        'RAW_DATA': {
            'source_dir': '/path/to/source/raw_data',
            'rejects': ['.snapshots'],
        },
        'DATA_PRODUCT': {
            'source_dir': '/path/to/source/data_products',
            'rejects': ['.snapshots'],
        },
        'recency_threshold_seconds': ONE_HOUR,
        'minimum_dataset_size': ONE_GIGABYTE,
        'wait_between_stability_checks_seconds': FIVE_MINUTES,
        'poll_interval_seconds': 10
    },
    'service_user': 'bioloopuser',
    'stage': {
        'purge': {
            'days_to_live': 20,
            'max_purges': 10
        },
        'alias_salt': ALIAS_SALT
    },
    'upload_status': {
        'UPLOADING': 'UPLOADING',
        'UPLOAD_FAILED': 'UPLOAD_FAILED',
        'UPLOADED': 'UPLOADED',
        'PROCESSING': 'PROCESSING',
        'PROCESSING_FAILED': 'PROCESSING_FAILED',
        'COMPLETE': 'COMPLETE',
        'FAILED': 'FAILED'
    },
    'DONE_STATUSES': {
        'REVOKED': 'REVOKED',
        'FAILURE': 'FAILURE',
        'SUCCESS': 'SUCCESS'
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
        'accept_duplicate_dataset': {
            'steps': [
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
        'reject_duplicate_dataset': {
            'steps': [
                {
                    'name': 'purge resources',
                    'task': 'purge_duplicate_dataset_resources'
                },
            ]
        },
        'handle_duplicate_dataset': {
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
                    'name': 'compare duplicate datasets',
                    'task': 'compare_duplicate_datasets'
                },
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
                },
            ]
        },
        'process_upload': {
            'steps': [
                {
                    'name': 'move uploaded chunks',
                    'task': 'move_upload_to_worker_space'
                },
                {
                    'name': 'process uploaded chunks',
                    'task': 'process_uploaded_chunks'
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
    'workflow': {
        'purge': {
            'types': ['integrated', 'stage', 'delete'],
            'age_threshold_seconds': 86400,
            'max_purge_count': 10
        }
    },
    'DATASET_STATES': {
        'REGISTERED': 'REGISTERED',
        'READY': 'READY',
        'INSPECTED': 'INSPECTED',
        'ARCHIVED': 'ARCHIVED',
        'FETCHED': 'FETCHED',
        'STAGED': 'STAGED',
        'DUPLICATE_REGISTERED': 'DUPLICATE_REGISTERED',
        'DUPLICATE_READY': 'DUPLICATE_READY',
        'DUPLICATE_REJECTED': 'DUPLICATE_REJECTED',
        'OVERWRITTEN': 'OVERWRITTEN',
        'DELETED': 'DELETED',
    },
    'ACTION_ITEM_TYPES': {
        'DUPLICATE_DATASET_INGESTION': 'DUPLICATE_DATASET_INGESTION',
    }
}

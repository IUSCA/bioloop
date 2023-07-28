import datetime
import os

from dotenv import load_dotenv

load_dotenv()  # take environment variables from .env.
YEAR = datetime.datetime.now().year
AUTH_TOKEN = os.environ['AUTH_TOKEN']
QUEUE_PASSWORD = os.environ['QUEUE_PASS']
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
        'auth_token': AUTH_TOKEN,
        'conn_timeout': 5,  # seconds
        'read_timeout': 30  # seconds
    },
    'paths': {
        'scratch': '/path/to/scratch',
        'RAW_DATA': {
            'archive': f'development/{YEAR}/raw_data',
            'stage': '/path/to/staged/raw_data',
            'qc': '/path/to/qc'
        },
        'DATA_PRODUCT': {
            'archive': f'development/{YEAR}/data_products',
            'stage': '/path/to/staged/data_products',
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
        'minimum_project_size': ONE_GIGABYTE,
        'wait_between_scans_seconds': FIVE_MINUTES,
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
                {
                    'name': 'generate_qc',
                    'task': 'generate_qc'
                }
            ]
        }
    },
    'celery': {
        'queue': {
            'url': 'localhost:5672/myvhost',
            'username': 'user',
            'password': QUEUE_PASSWORD
        },
        'mongo': {
            'url': 'localhost:27017',
            'username': 'root',
            'password': MONGO_PASSWORD
        }
    }
}

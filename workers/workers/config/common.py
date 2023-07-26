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
    'app_id': 'cpa-dev.sca.iu.edu',
    'genome_file_types': ['.cbcl', '.bcl', '.bcl.gz', '.bgzf', '.fastq.gz', '.bam', '.bam.bai', '.vcf.gz',
                          '.vcf.gz.tbi', '.vcf'],
    'api': {
        'base_url': 'http://localhost:3030',
        'auth_token': AUTH_TOKEN,
        'conn_timeout': 5,  # seconds
        'read_timeout': 30  # seconds
    },
    'paths': {
        'archive_scratch': '/opt/sca/scratch/development',
        'scratch': '/N/scratch/cpauser/cpa/development/scratch',
        'RAW_DATA': {
            'archive': f'development/{YEAR}/raw_data',
            'stage': '/N/scratch/cpauser/cpa/development/stage/raw_data',
            # 'qc': '/N/scratch/cpauser/cpa/development/data_products'
        },
        'DATA_PRODUCT': {
            'archive': f'development/{YEAR}/data_products',
            'stage': '/N/scratch/cpauser/cpa/development/stage/data_products',
        },
        'download_dir': '/N/scratch/cpauser/cpa/development/download'
    },
    'registration': {
        'RAW_DATA': {
            'source_dir': '/opt/sca/proteome/raw_data/',
            'rejects': ['.snapshots'],
        },
        'DATA_PRODUCT': {
            'source_dir': '/opt/sca/proteome/data_products/',
            'rejects': ['.snapshots'],
        },
        'recency_threshold_seconds': ONE_HOUR,
        'minimum_dataset_size': ONE_GIGABYTE,
        'wait_between_stability_checks_seconds': FIVE_MINUTES,
        'poll_interval_seconds': 10
    },
    'service_user': 'cpauser',
    'stage': {
        'purge': {
            'days_to_live': 20
        },
        'alias_salt': ALIAS_SALT
    },
    'workflow_registry': {
        'integrated': {
            'steps': [
                {
                    'name': 'await stability',
                    'task': 'await_stability',
                    'queue': 'archive.cpa.sca.iu.edu.q'
                },
                {
                    'name': 'inspect',
                    'task': 'inspect_dataset',
                    'queue': 'archive.cpa.sca.iu.edu.q'
                },
                {
                    'name': 'archive',
                    'task': 'archive_dataset',
                    'queue': 'archive.cpa.sca.iu.edu.q'
                },
                {
                    'name': 'stage',
                    'task': 'stage_dataset',
                    'queue': 'fetch.cpa.sca.iu.edu.q'
                },
                {
                    'name': 'validate',
                    'task': 'validate_dataset',
                    'queue': 'fetch.cpa.sca.iu.edu.q'
                },
                {
                    'name': 'delete source directory',
                    'task': 'delete_source',
                    'queue': 'archive.cpa.sca.iu.edu.q'
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

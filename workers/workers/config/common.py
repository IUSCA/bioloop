import datetime
import os

from dotenv import load_dotenv

load_dotenv()  # take environment variables from .env.
YEAR = datetime.datetime.now().year
AUTH_TOKEN = os.environ['AUTH_TOKEN']
QUEUE_PASSWORD = os.environ['QUEUE_PASS']
MONGO_PASSWORD = os.environ['MONGO_PASS']

config = {
    'app_id': 'dgl-dev.sca.iu.edu',
    'genome_file_types': ['.cbcl', '.bcl', '.bcl.gz', '.bgzf', '.fastq.gz', '.bam', '.bam.bai', '.vcf.gz',
                          '.vcf.gz.tbi', '.vcf'],
    'api': {
        'base_url': 'http://localhost:3030',
        'auth_token': AUTH_TOKEN,
        'conn_timeout': 5,  # seconds
        'read_timeout': 30  # seconds
    },
    'paths': {
        'scratch': '/N/scratch/dgluser/dgl/development/scratch',
        'raw_data': {
            'archive': f'development/{YEAR}/raw_data',
            'stage': '/N/scratch/dgluser/dgl/development/stage/raw_data',
            'qc': '/N/scratch/dgluser/dgl/development/data_products'
        },
        'data_product': {
            'archive': f'development/{YEAR}/data_products',
            'stage': '/N/scratch/dgluser/dgl/development/stage/data_products',
        }
    },
    'registration': {
        'raw_data': {
            'source_dir': '/N/project/DG_Multiple_Myeloma/share/legacy_raw_data/',
            'rejects': ['.snapshots'],
        },
        'data_products': {
            'source_dir': '/N/project/DG_Multiple_Myeloma/share/data_products/',
            'rejects': ['.snapshots'],
        },
    },
    'illumina': {
        'registration': {
            'rejects': [],
            'recency_threshold': 15 * 60,
            # 15 minutes; start archiving if the size hasn't changed for "recency_threshold"
            'minimum_project_size': 1024 * 1024 * 1024,  # 1 GB
            'wait_between_scans': 5 * 60,  # 5 minutes
        },
        'download': {
            'datasets': {
                'n_days': 21
            }
        }
    },
    'service_user': 'dgluser',
    'workflow_registry': {
        'illumina_integrated': {
            'steps': [
                {
                    'name': 'download',
                    'task': 'download_illumina_dataset'
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
                    'name': 'generate_reports',
                    'task': 'generate_reports'
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

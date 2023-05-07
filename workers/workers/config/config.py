import datetime
import os

from dotenv import load_dotenv

load_dotenv()  # take environment variables from .env.

# archiving directory name has year in its path to
# make it easier to purge data based on the year it was archived
YEAR = datetime.datetime.now().year
config = {
    'project_FQDN': 'dgl.sca.iu.edu',
    'genome_file_types': ['.cbcl', '.bcl', '.bcl.gz', '.bgzf', '.fastq.gz', '.bam', '.bam.bai', '.vcf.gz',
                          '.vcf.gz.tbi', '.vcf'],
    'api': {
        'username': 'user',
        'password': 'pass',
        'base_url': os.environ['API_URL'],
        'conn_timeout': 5,  # seconds
        'read_timeout': 30  # seconds
    },
    'paths': {
        'scratch': '/N/scratch/dgluser/dgl/production/scratch',
        'raw_data': {
            'archive': f'archive/{YEAR}/raw_data',
            'stage': '/N/project/DG_Multiple_Myeloma/share/raw_data',
            'qc': '/N/project/DG_Multiple_Myeloma/share/data_products'
        },
        'data_product': {
            'archive': f'archive/{YEAR}/data_products',
            'stage': '/N/scratch/dgluser/dgl/production/stage/data_products',
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
                'n_days': 7
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
    }
}

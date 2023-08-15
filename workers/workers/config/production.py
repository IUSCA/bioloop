import datetime

YEAR = datetime.datetime.now().year

# Production overrides

config = {
    'app_id': 'cfndap.sca.iu.edu',
    'api': {
        'base_url': 'https://cfndap.sca.iu.edu/api/',  # trailing slash is required
    },
    'paths': {
        'scratch': '/N/scratch/radyuser/cfndap/production/scratch',
        'DATA_PRODUCT': {
            'archive': f'production/{YEAR}/data_products',
            'stage': '/N/scratch/radyuser/cfndap/production/stage/data_products',
        },
        'download_dir': '/N/scratch/radyuser/cfndap/production/download',
        'root': '/N/scratch/radyuser/'
    },
    'registration': {
        'DATA_PRODUCT': {
            'source_dir': '/N/project/KBASE-Genome/RNA-Seq/ILMN_1629_Saykin_KBase_totalRNAseq1142_Feb2023/KBASE2_results',
            'rejects': ['.snapshots'],
        },
    },
    'service_user': 'radyuser',
    'celery': {
        'queue': {
            'url': 'commons3.sca.iu.edu:5672/celery_api',
            'username': 'celery_api',
        },
        'mongo': {
            'url': 'commons3.sca.iu.edu:27017/celery_api?authSource=celery_api',
            'username': 'celery_api',
        }
    }
}

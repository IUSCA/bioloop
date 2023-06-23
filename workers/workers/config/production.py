import datetime

YEAR = datetime.datetime.now().year

# Production overrides

config = {
    'app_id': 'cpa.sca.iu.edu',
    'api': {
        'base_url': 'https://cpa.sca.iu.edu/api/',  # trailing slash is required
    },
    'paths': {
        'archive_scratch': '/opt/sca/scratch/production',
        'scratch': '/N/scratch/cpauser/cpa/production/scratch',
        'RAW_DATA': {
            'archive': f'archive/{YEAR}/raw_data',
            'stage': '/N/scratch/cpauser/cpa/production/stage/raw_data',
            # 'qc': '/N/scratch/cpauser/cpa/production/stage/raw_data/qc'
        },
        'DATA_PRODUCT': {
            'archive': f'archive/{YEAR}/data_products',
            'stage': '/N/scratch/cpauser/cpa/production/stage/data_products',
        }
    },
    'registration': {
        'RAW_DATA': {
            'source_dir': '/opt/sca/proteome/raw_data/',
        },
        'DATA_PRODUCT': {
            'source_dir': '/opt/sca/proteome/data_products/',
        },
    },
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

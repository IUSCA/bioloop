import datetime

YEAR = datetime.datetime.now().year

# Production overrides

config = {
    'app_id': 'dgl.sca.iu.edu',
    'api': {
        'base_url': 'https://dgl.sca.iu.edu/api/',  # trailing slash is required
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
        },
        'data_products': {
            'source_dir': '/N/project/DG_Multiple_Myeloma/share/data_products/',
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

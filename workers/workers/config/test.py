import datetime

YEAR = datetime.datetime.now().year

config = {
    'api': {
        'base_url': 'http://localhost:3130/',  # trailing slash is required
    },
    'paths': {
        'scratch': '/N/scratch/scadev/bioloop/test/scratch',
        'RAW_DATA': {
            'archive': f'test/{YEAR}/raw_data',
            'stage': '/N/scratch/scadev/bioloop/test/staged/raw_data',
        },
        'DATA_PRODUCT': {
            'archive': f'test/{YEAR}/data_products',
            'stage': '/N/scratch/scadev/bioloop/test/staged/data_products',
        },
        'download_dir': '/N/scratch/scadev/bioloop/test/downloads',
        'root': '/N/scratch/scadev/'
    },
    'registration': {
        'RAW_DATA': {
            'source_dir': '/N/scratch/scadev/bioloop/test/source/raw_data',
        },
        'DATA_PRODUCT': {
            'source_dir': '/N/scratch/scadev/bioloop/test/source/data_products',
        },
    },
    'celery': {
        'queue': {
            'url': 'localhost:5772/myvhost',
        },
        'mongo': {
            'url': 'localhost:28017',
        }
    }
}

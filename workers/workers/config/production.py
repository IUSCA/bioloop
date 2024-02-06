import datetime

YEAR = datetime.datetime.now().year

config = {
    'app_id': 'bioloop-dev.sca.iu.edu',
    'api': {
        'base_url': 'https://bioloop-dev.sca.iu.edu/api/',  # trailing slash is required
    },
    'paths': {
        'scratch': '/N/scratch/scadev/bioloop/dev/scratch',
        'RAW_DATA': {
            'archive': f'dev/{YEAR}/raw_data',
            'stage': '/N/scratch/scadev/bioloop/dev/staged/raw_data',
        },
        'DATA_PRODUCT': {
            'archive': f'dev/{YEAR}/data_products',
            'stage': '/N/scratch/scadev/bioloop/dev/staged/data_products',
        },
        'download_dir': '/N/scratch/scadev/bioloop/dev/downloads',
        'root': '/N/scratch/scadev/'
    },
    'registration': {
        'RAW_DATA': {
            'source_dir': '/N/scratch/scadev/bioloop/dev/source/raw_data',
        },
        'DATA_PRODUCT': {
            'source_dir': '/N/scratch/scadev/bioloop/dev/source/data_products',
        },
        'recency_threshold_seconds': 10*60,
        'wait_between_stability_checks_seconds': 45
    },
    'service_user': 'scadev',
}

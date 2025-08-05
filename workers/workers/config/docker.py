import datetime

YEAR = datetime.datetime.now().year

TEN_MEGABYTES = 10 * 1024 * 1024

config = {
    'paths': {
        'scratch': '/opt/sca/data/scratch',
        'RAW_DATA': {
            'archive': f'/opt/sca/data/archive/{YEAR}/raw_data',
            'stage': '/opt/sca/data/staged/raw_data',
            'bundle': {
                'generate': '/opt/sca/data/bundle/raw_data/generation',
                'stage': '/opt/sca/data/bundle/raw_data/staging',
            },
            'qc': '/opt/sca/data/qc/raw_data'
        },
        'DATA_PRODUCT': {
            'upload': '/opt/sca/data/uploads',
            'archive': f'/opt/sca/data/archive/{YEAR}/data_products',
            'stage': '/opt/sca/data/staged/data_products',
            'bundle': {
                'generate': '/opt/sca/data/bundle/data_products/generation',
                'stage': '/opt/sca/data/bundle/data_products/staging',
            },
        },
        'download_dir': '/opt/sca/data/downloads',
        'root': '/opt/sca/data'
    },
    'registration': {
        'RAW_DATA': {
            'source_dir': '/opt/sca/data/origin/raw_data',
        },
        'DATA_PRODUCT': {
            'source_dir': '/opt/sca/data/origin/data_products',
        },
        'recency_threshold_seconds': 0,
        'minimum_dataset_size': TEN_MEGABYTES,
    },
}

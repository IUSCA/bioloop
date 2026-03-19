import datetime

YEAR = datetime.datetime.now().year

TEN_MEGABYTES = 10 * 1024 * 1024

config = {
    'paths': {
        'scratch': '/opt/sca/data/scratch',
        'RAW_DATA': {
            'upload': '/opt/sca/data/uploads/raw_data',
            'archive': f'/opt/sca/data/archive/{YEAR}/raw_data',
            'stage': '/opt/sca/data/staged/raw_data',
            'bundle': {
                'generate': '/opt/sca/data/bundle/raw_data/generation',
                'stage': '/opt/sca/data/bundle/raw_data/staging',
            },
            'qc': '/opt/sca/data/qc/raw_data'
        },
        'DATA_PRODUCT': {
            'upload': '/opt/sca/data/uploads/data_product',
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
            # Directories that should never be auto-registered as datasets.
            'rejects': ['.snapshots', '_testObservedPath_*'],
        },
        'DATA_PRODUCT': {
            'source_dir': '/opt/sca/data/origin/data_products',
            'rejects': ['.snapshots', '_testObservedPath_*'],
        },
        'recency_threshold_seconds': 300,
        'wait_between_stability_checks_seconds': 5,  # poll frequently in docker dev
        'minimum_dataset_size': TEN_MEGABYTES,
    },
    'register_ondemand': {
        'RAW_DATA': {
            'source_dir': '/opt/sca/data/register_ondemand/raw_data',
        },
        'DATA_PRODUCT': {
            'source_dir': '/opt/sca/data/register_ondemand/data_products',
        },
    },
    'logs': {
        'register_ondemand': '/opt/sca/logs/register_ondemand'
    }
}

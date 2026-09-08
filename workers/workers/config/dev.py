"""Config for running the workers natively on a developer machine.

Selected with APP_ENV=dev.  Every path is rooted at the repository's ./data
directory, which is gitignored and created by

    poetry run python -m workers.scripts.setup_dirs --create=True

Two things differ from a real deployment. The archive is a local directory
rather than tape, because the SDA command line tools are not installed on a
developer machine; see the 'storage' key below and workers/storage/. And the
stability, size, and polling thresholds are small, so a test dataset of a few
kilobytes registers in seconds instead of an hour.
"""

import datetime
from pathlib import Path

YEAR = datetime.datetime.now().year

# workers/workers/config/dev.py -> workers/workers/config -> workers/workers -> workers -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
DATA = REPO_ROOT / 'data'

ONE_MEGABYTE = 1024 * 1024

config = {
    # The archive is an ordinary directory. hsi is not installed here.
    'storage': {
        'backend': 'posix',
    },
    'paths': {
        'scratch': str(DATA / 'scratch'),
        'RAW_DATA': {
            'upload': str(DATA / 'uploads' / 'raw_data'),
            'archive': str(DATA / 'archive' / str(YEAR) / 'raw_data'),
            'stage': str(DATA / 'staged' / 'raw_data'),
            'bundle': {
                'generate': str(DATA / 'bundle' / 'raw_data' / 'generation'),
                'stage': str(DATA / 'bundle' / 'raw_data' / 'staging'),
            },
            'qc': str(DATA / 'qc' / 'raw_data'),
        },
        'DATA_PRODUCT': {
            'upload': str(DATA / 'uploads' / 'data_products'),
            'archive': str(DATA / 'archive' / str(YEAR) / 'data_products'),
            'stage': str(DATA / 'staged' / 'data_products'),
            'bundle': {
                'generate': str(DATA / 'bundle' / 'data_products' / 'generation'),
                'stage': str(DATA / 'bundle' / 'data_products' / 'staging'),
            },
        },
        'download_dir': str(DATA / 'downloads'),
        'root': str(DATA),
    },
    'registration': {
        'RAW_DATA': {
            'source_dir': str(DATA / 'origin' / 'raw_data'),
            # Directories that should never be auto-registered as datasets.
            'rejects': ['.snapshots', '_testObservedPath_*'],
        },
        'DATA_PRODUCT': {
            'source_dir': str(DATA / 'origin' / 'data_products'),
            'rejects': ['.snapshots', '_testObservedPath_*'],
        },
        # A dataset copied into ./data/origin should register within a minute,
        # not an hour, so these are far shorter than the production defaults.
        'recency_threshold_seconds': 30,
        'wait_between_stability_checks_seconds': 5,
        'minimum_dataset_size': ONE_MEGABYTE,
    },
    'register_ondemand': {
        'RAW_DATA': {
            'source_dir': str(DATA / 'register_ondemand' / 'raw_data'),
        },
        'DATA_PRODUCT': {
            'source_dir': str(DATA / 'register_ondemand' / 'data_products'),
        },
    },
    'logs': {
        'register_ondemand': str(REPO_ROOT / 'logs' / 'register_ondemand'),
    },
}

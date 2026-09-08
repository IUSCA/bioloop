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

# Named once because two config shapes point at them: 'registration.ingestion',
# keyed by ingestion directory, and the legacy 'registration.<TYPE>' blocks.
RAW_DATA_DIR = DATA / 'origin' / 'raw_data'
DATA_PRODUCT_DIR = DATA / 'origin' / 'data_products'

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
        # The two ingestion directories watch_v2.py polls. The owning groups are the
        # seeded Genomics Core and Bioinformatics Core, whose ids are hard-coded in
        # api/prisma/seed_data/groups.js and so survive a re-seed.
        # @see docs/design/groups/dataset-creation.md — The watch script
        'ingestion': {
            'raw_data': {
                'source_dir': str(RAW_DATA_DIR),
                'dataset_type': 'RAW_DATA',
                'owner_group_id': '83101409-fa05-44be-abca-c91fff4f9754',
                # Directories that should never be auto-registered as datasets.
                'rejects': ['.snapshots', '_testObservedPath_*'],
            },
            'data_products': {
                'source_dir': str(DATA_PRODUCT_DIR),
                'dataset_type': 'DATA_PRODUCT',
                'owner_group_id': '79606964-2385-4c72-8f5f-6d3412049a1c',
                'rejects': ['.snapshots', '_testObservedPath_*'],
            },
        },
        # The legacy watch.py, the watch tests, and setup_dirs still key on the
        # dataset type. Both shapes name the same directories.
        'RAW_DATA': {
            'source_dir': str(RAW_DATA_DIR),
            'rejects': ['.snapshots', '_testObservedPath_*'],
        },
        'DATA_PRODUCT': {
            'source_dir': str(DATA_PRODUCT_DIR),
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

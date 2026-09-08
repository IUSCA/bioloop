"""Watch the configured ingestion directories and register through the v2 dataset API.

One observer per entry under `registration.ingestion`. Each entry names its own
directory, the dataset type it produces, and the group that will own the results,
so several directories may feed the same type under different groups.

Run this or scripts/watch.py, never both. They poll the same directories and would
race to register the same new subdirectory.

    python -m workers.scripts.watch_v2
    python -m workers.scripts.watch_v2 --dry-run
    python -m workers.scripts.watch_v2 --only raw_data

@see docs/design/groups/dataset-creation.md — The watch script
"""

import argparse
import logging

from workers.celery_app import app as celery_app
from workers.config import config
from workers.services.registration_v2 import RegisterV2
from workers.services.watchlib import Observer, Poller

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Facts about the directory itself, which the Observer needs rather than RegisterV2.
# Everything else in an ingestion entry is passed to RegisterV2 as metadata.
_OBSERVER_KEYS = frozenset({
    'source_dir', 'dataset_type', 'owner_group_id', 'rejects',
    'workflow', 'poll_interval_seconds', 'full_scan_every_n_scans', 'max_retries',
})

_REQUIRED_KEYS = ('source_dir', 'dataset_type', 'owner_group_id')

# The workflow started for a dataset whose ingestion entry does not name one.
# RegisterV2 requires a workflow rather than defaulting it, so this literal has no
# second home. Every other default lives on RegisterV2 or on Observer.
DEFAULT_WORKFLOW = 'integrated'


def build_observer(key: str, dry_run: bool) -> Observer:
    """Build the poller for one ingestion directory, named by its config key.

    Every fact about the ingestion comes from `registration.ingestion[key]`. A
    missing `source_dir`, `dataset_type`, or `owner_group_id` raises, because a gap
    in a configuration table is a thing to report rather than a value to guess.

    Any key the entry carries beyond the recognised ones becomes dataset metadata,
    so a directory can record where its data came from without a code change.

    Each optional value has exactly one fallback. `poll_interval_seconds` and
    `full_scan_every_n_scans` fall back to the shared `registration` settings, and
    `workflow` falls back to DEFAULT_WORKFLOW above. `rejects` is passed through
    untouched so RegisterV2's own default applies, and `max_retries` is omitted
    entirely so Observer's own default applies.
    """
    registration = config['registration']
    entry = registration.get('ingestion', {}).get(key)
    if entry is None:
        available = ', '.join(sorted(registration.get('ingestion', {}))) or '(none)'
        raise KeyError(f'registration.ingestion.{key} is not configured. Configured: {available}')

    missing = [k for k in _REQUIRED_KEYS if not entry.get(k)]
    if missing:
        raise ValueError(
            f'registration.ingestion.{key} is missing {", ".join(missing)}'
        )

    metadata = {k: v for k, v in entry.items() if k not in _OBSERVER_KEYS}

    register = RegisterV2(
        app=celery_app,
        dataset_type=entry['dataset_type'],
        owner_group_id=entry['owner_group_id'],
        wf_name=entry.get('workflow', DEFAULT_WORKFLOW),
        rejects=entry.get('rejects'),
        dry_run=dry_run,
        **metadata,
    )

    observer_args = {
        'interval': entry.get(
            'poll_interval_seconds', registration['poll_interval_seconds'],
        ),
        'full_scan_every_n_scans': entry.get(
            'full_scan_every_n_scans', registration['full_scan_every_n_scans'],
        ),
    }
    if 'max_retries' in entry:
        observer_args['max_retries'] = entry['max_retries']

    return Observer(
        name=key,
        dir_path=entry['source_dir'],
        callback=register.register,
        **observer_args,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--dry-run', action='store_true',
        help='log the datasets that would be created and create none',
    )
    parser.add_argument(
        '--only', action='append', metavar='KEY', default=None,
        help='watch only this ingestion directory; repeatable',
    )
    args = parser.parse_args()

    keys = args.only or sorted(config['registration'].get('ingestion', {}))
    if not keys:
        raise ValueError('registration.ingestion is empty; there is nothing to watch')

    poller = Poller()
    for key in keys:
        poller.register(build_observer(key, dry_run=args.dry_run))
    poller.poll()


if __name__ == "__main__":
    main()

"""
Cleanup job for stale TUS staging artifacts.

TUS context (how upload files appear on disk):
- During upload, @tus/file-store writes per-upload-ID staging files under
  <uploads_root>:
    1) payload file:  <tus_id>
    2) sidecar JSON:  <tus_id>.json
- After a file finishes, API moves the payload to dataset.origin_path and
  relocates sidecar JSON to:
    <uploads_root>/uploaded_data/<dataset_id>/<tus_id>.json

Why this script exists:
- Staging placeholders and sidecars can linger.
- This script removes artifacts older than a TTL without touching dataset
  payload directories (raw_data/data_product/data_products).

How to run:
- Default run (ttl-days=14, dry-run=False):
    python -m workers.scripts.purge_stale_uploaded
- Dry run (no deletions; logs only):
    python -m workers.scripts.purge_stale_uploaded --dry-run
- Custom TTL in days:
    python -m workers.scripts.purge_stale_uploaded --ttl-days=30
- Custom TTL + dry run:
    python -m workers.scripts.purge_stale_uploaded --ttl-days=7 --dry-run

Flags:
- --ttl-days <float>  Age threshold in days. Default: 14.0
- --dry-run           If set, log planned deletions without deleting files.
                      Default: False
"""

import argparse
import logging
import re
import time
from pathlib import Path
from typing import Pattern, Set, TypedDict

from workers.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# TUS upload IDs in this app are 32-char lowercase hex strings.
TUS_ID_RE: Pattern[str] = re.compile(r'^[a-f0-9]{32}$')

# Dataset payload directories that must never be deleted by this script.
PROTECTED_DIRS: Set[str] = {'raw_data', 'data_product', 'data_products'}


class TopLevelPurgeSummary(TypedDict):
    deleted: int
    skipped: int
    errors: int


class UploadedDataPurgeSummary(TypedDict):
    deleted: int
    dirs_removed: int
    skipped: int
    errors: int


class CliArgs(TypedDict):
    ttl_days: float
    dry_run: bool


def is_older_than(path: Path, cutoff_ts: float) -> bool:
    try:
        return path.stat().st_mtime < cutoff_ts
    except FileNotFoundError:
        return False


def purge_top_level_staging(
    upload_root: Path,
    cutoff_ts: float,
    dry_run: bool,
) -> TopLevelPurgeSummary:
    """
    Delete old top-level TUS staging artifacts in <upload_root> only.
    This includes:
      - <tus_id> (placeholder staging files)
      - <tus_id>.json (legacy sidecars)

    Notes:
      - <tus_id> files are staging placeholders created by the API/TUS flow.
      - <tus_id>.json files are TUS sidecar metadata files.
      - This function never recurses into dataset payload directories.
    """
    summary: TopLevelPurgeSummary = {'deleted': 0, 'skipped': 0, 'errors': 0}

    for entry in upload_root.iterdir():
        name = entry.name
        logger.info('Checking entry: %s', name)
        if entry.is_dir():
            # Never recurse into payload dirs from this function.
            logger.info('Skipping payload directory: %s', name)
            summary['skipped'] += 1
            continue

        is_tus_data: bool = bool(TUS_ID_RE.fullmatch(name))
        is_legacy_sidecar: bool = name.endswith('.json') and bool(TUS_ID_RE.fullmatch(name[:-5]))
        logger.info('is_tus_data: %s', is_tus_data)
        logger.info('is_legacy_sidecar: %s', is_legacy_sidecar)

        if not (is_tus_data or is_legacy_sidecar):
            logger.info('Skipping since neither TUS data nor legacy sidecar: %s', name)
            summary['skipped'] += 1
            continue

        if not is_older_than(entry, cutoff_ts):
            logger.info('Skipping since not older than cutoff: %s', name)
            summary['skipped'] += 1
            continue

        try:
            if not dry_run:
                logger.info('Deleting stale top-level staging artifact: %s', name)
                entry.unlink(missing_ok=True)
            else:
                logger.info('Dry run: Would have deleted stale top-level staging artifact: %s', name)
            summary['deleted'] += 1
        except Exception:
            logger.exception('Failed deleting staging artifact: %s', entry)
            summary['errors'] += 1

    return summary


def purge_uploaded_data_sidecars(
    upload_root: Path,
    cutoff_ts: float,
    dry_run: bool,
) -> UploadedDataPurgeSummary:
    """
    Delete old sidecar JSON files under:
      <upload_root>/uploaded_data/<dataset_id>/*.json
    and remove empty dataset sidecar directories afterwards.

    These sidecars are moved here by API onUploadFinish for per-dataset
    organization and targeted cleanup.
    """
    summary: UploadedDataPurgeSummary = {'deleted': 0, 'dirs_removed': 0, 'skipped': 0, 'errors': 0}

    uploaded_data_dir = upload_root / 'uploaded_data'
    if not uploaded_data_dir.exists():
        logger.info('No uploaded_data directory found under %s; skipping sidecar purge.', upload_root)
        return summary

    for dataset_dir in uploaded_data_dir.iterdir():
        if not dataset_dir.is_dir():
            logger.info('Skipping non-directory under uploaded_data: %s', dataset_dir)
            summary['skipped'] += 1
            continue

        for sidecar in dataset_dir.glob('*.json'):
            if not is_older_than(sidecar, cutoff_ts):
                summary['skipped'] += 1
                continue

            try:
                if not dry_run:
                    logger.info('Deleting stale sidecar: %s', sidecar)
                    sidecar.unlink(missing_ok=True)
                else:
                    logger.info('Dry run: would delete stale sidecar: %s', sidecar)
                summary['deleted'] += 1
            except Exception:
                logger.exception('Failed deleting sidecar: %s', sidecar)
                summary['errors'] += 1

        # Remove empty per-dataset sidecar directory if nothing remains.
        try:
            if not any(dataset_dir.iterdir()):
                logger.info('Removing empty sidecar dir: %s', dataset_dir)
                if not dry_run:
                    dataset_dir.rmdir()
                summary['dirs_removed'] += 1
        except Exception:
            logger.exception('Failed removing sidecar dir: %s', dataset_dir)
            summary['errors'] += 1

    # Remove uploaded_data root if now empty.
    try:
        if uploaded_data_dir.exists() and not any(uploaded_data_dir.iterdir()):
            logger.info('Removing empty uploaded_data root: %s', uploaded_data_dir)
            if not dry_run:
                uploaded_data_dir.rmdir()
            summary['dirs_removed'] += 1
    except Exception:
        logger.exception('Failed removing uploaded_data root: %s', uploaded_data_dir)
        summary['errors'] += 1

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Purge stale TUS staging artifacts older than a TTL.',
    )
    parser.add_argument('--ttl-days', type=float, default=14.0, help='Age threshold in days (default: 14).')
    parser.add_argument('--dry-run', action='store_true', help='Log actions without deleting files.')
    parsed_args = parser.parse_args()
    args: CliArgs = {
        'ttl_days': float(parsed_args.ttl_days),
        'dry_run': bool(parsed_args.dry_run),
    }

    upload_root = Path(config['paths']['root']) / 'uploads'
    cutoff_ts: float = time.time() - (args['ttl_days'] * 24 * 60 * 60)

    logger.info('Starting upload staging purge')
    logger.info('Upload root: %s', upload_root)
    logger.info('TTL days: %s', args['ttl_days'])
    logger.info('Dry-run: %s', args['dry_run'])
    logger.info('Protected payload dirs (never touched): %s', ', '.join(sorted(PROTECTED_DIRS)))

    if not upload_root.exists():
        logger.info('Upload root does not exist; nothing to purge.')
        return

    # Explicitly assert protected dirs are skipped by design.
    for protected in PROTECTED_DIRS:
        p = upload_root / protected
        if p.exists():
            logger.info('Keeping protected payload directory: %s', p)

    top_level_summary: TopLevelPurgeSummary = purge_top_level_staging(upload_root, cutoff_ts, args['dry_run'])
    sidecar_summary: UploadedDataPurgeSummary = purge_uploaded_data_sidecars(
        upload_root,
        cutoff_ts,
        args['dry_run'],
    )

    logger.info('Purge complete')
    logger.info('Top-level summary: %s', top_level_summary)
    logger.info('uploaded_data summary: %s', sidecar_summary)


if __name__ == '__main__':
    main()

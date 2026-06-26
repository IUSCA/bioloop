"""
Cleanup job for TUS staging artifacts and upload-area payloads.

TUS context (how upload files appear on disk):
- During upload, @tus/file-store writes per-upload-ID staging files under
  <uploads_root>:
    1) payload file:  <tus_id>
    2) sidecar JSON:  <tus_id>.json
- After a file finishes, API moves the payload to dataset.origin_path and
  relocates sidecar JSON to:
    <uploads_root>/uploaded_data/<dataset_id>/<tus_id>.json

This script:
1) Removes **top-level** stale TUS placeholders / legacy sidecars by TTL (orphan
   uploads that never finished).
2) Removes **uploaded_data/<dataset_id>/*.json** when the upload log is in a
   terminal status (no 14-day wait), and removes orphan dataset-id dirs
   immediately when no upload log exists.
3) Removes **dataset payload trees** under raw_data / data_products
   when the dataset has **archive_path** set (archive workflow finished — same
   moment `ARCHIVED` state is recorded).
4) Marks stale **UPLOADING** sessions older than stale-uploading threshold as
   **PERMANENTLY_FAILED**
   and removes their known disk artifacts.

How to run:
- Default run (dry-run=False):
    python -m workers.scripts.purge_stale_uploaded
- Dry run (no deletions; logs only):
    python -m workers.scripts.purge_stale_uploaded --dry-run
- Custom TTL in days:
    python -m workers.scripts.purge_stale_uploaded --ttl-days=30

Flags:
- --ttl-days <float>  Age threshold in days for top-level TUS artifacts.
                      Default: 14.0
- --stale-uploading-days <float>
                      Age threshold in days for stale UPLOADING sessions to be
                      marked PERMANENTLY_FAILED. Default: 14.0
- --dry-run           If set, log planned deletions without deleting files.
                      Default: False
"""

from __future__ import annotations

import argparse
import logging
import re
import shutil
import time
from pathlib import Path
from typing import Pattern, Set, TypedDict

import requests
import workers.api as api
from workers.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# TUS upload IDs in this app are 32-char lowercase hex strings.
TUS_ID_RE: Pattern[str] = re.compile(r'^[a-f0-9]{32}$')

# Dataset payload directories under <uploads_root> (never touched by TTL top-level purge).
PROTECTED_DIRS: Set[str] = {'raw_data', 'data_products'}

# Sidecars under the `uploaded_data` directory can be removed once the 
# upload pipeline will not read them again.
TERMINAL_UPLOAD_STATUSES_FOR_SIDECARS: tuple[str, ...] = (
    'COMPLETE',
    'PERMANENTLY_FAILED',
    'UPLOAD_FAILED',
    'VERIFICATION_FAILED',
)


class TopLevelPurgeSummary(TypedDict):
    """Counters for top-level TUS artifact cleanup (<upload_root>/<tus_id>[.json]).

    deleted:
        Number of stale top-level files deleted (or that would be deleted in dry-run).
    skipped:
        Number of entries ignored because they were directories, non-TUS names, or newer than TTL.
    errors:
        Number of deletion failures due to filesystem/runtime exceptions.
    """
    deleted: int
    skipped: int
    errors: int


class UploadedDataPurgeSummary(TypedDict):
    """Counters for uploaded_data sidecar cleanup (<upload_root>/uploaded_data/<dataset_id>/*.json).

    terminal_deleted:
        Sidecars deleted because the dataset upload log is terminal (COMPLETE or terminal failure).
    orphan_deleted:
        Sidecars deleted from dataset-id folders with no upload-log row.
    dirs_removed:
        Empty directories removed (dataset-level dirs and the uploaded_data root).
    skipped:
        Entries intentionally left untouched (in-flight upload logs, invalid folder names, etc.).
    errors:
        Deletion/rmdir failures encountered while processing sidecars/directories.
    """
    terminal_deleted: int
    orphan_deleted: int
    dirs_removed: int
    skipped: int
    errors: int


class PayloadPurgeSummary(TypedDict):
    """Counters for archived payload tree cleanup (dataset origin_path directories).

    trees_removed:
        Number of archived upload payload directories removed.
    skipped:
        Datasets skipped because origin_path was missing, out-of-scope, or absent on disk.
    errors:
        Directory removal failures.
    """
    trees_removed: int
    skipped: int
    errors: int


class StaleUploadingSummary(TypedDict):
    """Counters for stale UPLOADING guard (status transition + artifact cleanup).

    marked_permanently_failed:
        Upload logs transitioned from UPLOADING to PERMANENTLY_FAILED.
    artifact_files_removed:
        Number of top-level <process_id> and <process_id>.json files removed.
    payload_trees_removed:
        Number of upload payload trees (origin_path) removed for stale UPLOADING sessions.
    skipped:
        Candidates skipped because status had already advanced before update.
    errors:
        API or filesystem failures during stale-session handling.
    """
    marked_permanently_failed: int
    artifact_files_removed: int
    payload_trees_removed: int
    skipped: int
    errors: int


class CliArgs(TypedDict):
    ttl_days: float
    stale_uploading_days: float
    dry_run: bool


def is_older_than(path: Path, cutoff_ts: float) -> bool:
    try:
        return path.stat().st_mtime < cutoff_ts
    except FileNotFoundError:
        return False


def _is_managed_upload_payload_dir(path: Path, upload_roots: set[Path]) -> bool:
    """True if path resolves to <upload_root>/{raw_data|data_products}/<id>/<name>/..."""
    try:
        path_res = path.resolve()
    except (ValueError, OSError):
        return False
    for upload_root in upload_roots:
        try:
            rel = path_res.relative_to(upload_root.resolve())
        except (ValueError, OSError):
            continue
        if len(rel.parts) >= 3 and rel.parts[0] in PROTECTED_DIRS:
            return True
    return False


def _discover_upload_roots() -> set[Path]:
    # Discover the shared TUS root(s) from dataset-type upload directories:
    #   RAW_DATA.upload      -> .../uploads/raw_data
    #   DATA_PRODUCT.upload  -> .../uploads/data_products
    # We intentionally normalize both to their parent (.../uploads) because that
    # is where top-level TUS files (<tus_id>, <tus_id>.json) and uploaded_data/
    # live. Multiple parents are supported in case paths differ across types.
    roots: set[Path] = set()
    for dataset_type in ('RAW_DATA', 'DATA_PRODUCT'):
        upload_path = config['paths'].get(dataset_type, {}).get('upload')
        if not upload_path:
            continue
        # /x/uploads/raw_data or /x/uploads/data_products -> /x/uploads
        roots.add(Path(upload_path).parent)
    return roots


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


def _remove_empty_dir(path: Path, dry_run: bool) -> bool:
    try:
        if path.exists() and path.is_dir() and not any(path.iterdir()):
            logger.info('Removing empty directory: %s', path)
            if not dry_run:
                path.rmdir()
            return True
    except Exception:
        logger.exception('Failed removing empty directory: %s', path)
    return False


def purge_uploaded_data_sidecars(
    upload_root: Path,
    dry_run: bool,
) -> UploadedDataPurgeSummary:
    """
    - Delete sidecars for datasets whose upload log is terminal (API-driven, no TTL).
    - Delete sidecars immediately for dataset dirs with **no** upload log (orphans).
    - Skip deletion when a log exists and the upload is still in progress (e.g. VERIFYING).
    """
    summary: UploadedDataPurgeSummary = {
        'terminal_deleted': 0,
        'orphan_deleted': 0,
        'dirs_removed': 0,
        'skipped': 0,
        'errors': 0,
    }

    uploaded_data_dir = upload_root / 'uploaded_data'
    if not uploaded_data_dir.exists():
        logger.info('No uploaded_data directory under %s; skipping sidecar purge.', upload_root)
        return summary

    terminal_uploads = api.get_uploads_by_statuses(list(TERMINAL_UPLOAD_STATUSES_FOR_SIDECARS))
    terminal_ids = {u['dataset_id'] for u in terminal_uploads}

    for dataset_dir in uploaded_data_dir.iterdir():
        if not dataset_dir.is_dir():
            summary['skipped'] += 1
            continue

        if not dataset_dir.name.isdigit():
            logger.info('Skipping non-dataset-id directory under uploaded_data: %s', dataset_dir.name)
            summary['skipped'] += 1
            continue

        dataset_id = int(dataset_dir.name)

        if dataset_id in terminal_ids:
            for sidecar in dataset_dir.glob('*.json'):
                try:
                    if not dry_run:
                        logger.info('Deleting terminal-status sidecar: %s', sidecar)
                        sidecar.unlink(missing_ok=True)
                    else:
                        logger.info('Dry run: would delete terminal-status sidecar: %s', sidecar)
                    summary['terminal_deleted'] += 1
                except Exception:
                    logger.exception('Failed deleting sidecar: %s', sidecar)
                    summary['errors'] += 1
            if _remove_empty_dir(dataset_dir, dry_run):
                summary['dirs_removed'] += 1
            continue

        try:
            api.get_dataset_upload_log(dataset_id)
            # In-flight or retryable — do not delete sidecars from here.
            summary['skipped'] += 1
            continue
        except requests.HTTPError as err:
            if err.response is None or err.response.status_code != 404:
                logger.exception('Failed querying upload log for dataset_id=%s', dataset_id)
                summary['errors'] += 1
                continue

        for sidecar in dataset_dir.glob('*.json'):
            try:
                if not dry_run:
                    logger.info('Deleting orphan sidecar immediately (no upload log): %s', sidecar)
                    sidecar.unlink(missing_ok=True)
                else:
                    logger.info('Dry run: would delete orphan sidecar immediately: %s', sidecar)
                summary['orphan_deleted'] += 1
            except Exception:
                logger.exception('Failed deleting sidecar: %s', sidecar)
                summary['errors'] += 1

        if _remove_empty_dir(dataset_dir, dry_run):
            summary['dirs_removed'] += 1

    if _remove_empty_dir(uploaded_data_dir, dry_run):
        summary['dirs_removed'] += 1

    return summary


def _iter_archived_datasets(page_size: int = 200):
    # Iterate archived datasets in pages to avoid loading all records at once.
    # We query both non-deleted and deleted datasets because archived upload
    # payloads can exist for either; cleanup logic treats both the same.
    for deleted_flag in (False, True):
        offset = 0
        while True:
            batch = api.get_all_datasets(
                archived=True,
                deleted=deleted_flag,
                limit=page_size,
                offset=offset,
            )
            if not batch:
                break
            yield from batch
            if len(batch) < page_size:
                break
            offset += page_size


def purge_archived_upload_payloads(upload_roots: set[Path], dry_run: bool) -> PayloadPurgeSummary:
    """
    Remove on-disk upload payload directories for datasets that have been archived
    (archive_path set). Only paths under upload_root and inside protected type dirs
    are eligible.
    """
    summary: PayloadPurgeSummary = {'trees_removed': 0, 'skipped': 0, 'errors': 0}

    for dataset in _iter_archived_datasets():
        origin = dataset.get('origin_path')
        if not origin:
            summary['skipped'] += 1
            continue

        tree = Path(origin)
        if not _is_managed_upload_payload_dir(tree, upload_roots):
            logger.debug(
                'Skipping origin_path not under upload payload dirs: %s',
                origin,
            )
            summary['skipped'] += 1
            continue

        if not tree.exists():
            summary['skipped'] += 1
            continue

        try:
            if not dry_run:
                logger.info('Removing archived upload payload tree: %s', tree)
                shutil.rmtree(tree, ignore_errors=False)
            else:
                logger.info('Dry run: would remove archived upload payload tree: %s', tree)
            summary['trees_removed'] += 1
        except Exception:
            logger.exception('Failed removing payload tree: %s', tree)
            summary['errors'] += 1

    return summary


def _remove_stale_uploading_artifacts(upload_log: dict, upload_roots: set[Path], dry_run: bool) -> tuple[int, int]:
    """Delete known stale-UPLOADING artifacts. Returns (files_removed, payload_trees_removed)."""
    files_removed = 0
    trees_removed = 0
    process_id = upload_log.get('process_id')
    if process_id:
        for upload_root in upload_roots:
            for path in (upload_root / process_id, upload_root / f'{process_id}.json'):
                if not path.exists():
                    continue
                if not dry_run:
                    logger.info('Deleting stale UPLOADING top-level artifact: %s', path)
                    path.unlink(missing_ok=True)
                else:
                    logger.info('Dry run: would delete stale UPLOADING top-level artifact: %s', path)
                files_removed += 1

    origin = upload_log.get('dataset', {}).get('origin_path')
    if origin:
        tree = Path(origin)
        if _is_managed_upload_payload_dir(tree, upload_roots) and tree.exists():
            if not dry_run:
                logger.info('Deleting stale UPLOADING payload tree: %s', tree)
                shutil.rmtree(tree, ignore_errors=False)
            else:
                logger.info('Dry run: would delete stale UPLOADING payload tree: %s', tree)
            trees_removed += 1
    return files_removed, trees_removed


def fail_stale_uploading_sessions(age_days: float, upload_roots: set[Path], dry_run: bool) -> StaleUploadingSummary:
    """Mark old UPLOADING sessions as PERMANENTLY_FAILED and clean their artifacts."""
    summary: StaleUploadingSummary = {
        'marked_permanently_failed': 0,
        'artifact_files_removed': 0,
        'payload_trees_removed': 0,
        'skipped': 0,
        'errors': 0,
    }

    try:
        response = api.get_expired_uploads(status='UPLOADING', age_days=age_days)
        uploads = response.get('uploads', [])
    except Exception:
        logger.exception('Failed fetching stale UPLOADING sessions')
        summary['errors'] += 1
        return summary

    for upload in uploads:
        dataset_id = upload['dataset_id']
        try:
            upload_log = api.get_dataset_upload_log(dataset_id)
        except Exception:
            logger.exception('Failed getting upload-log for stale UPLOADING dataset_id=%s', dataset_id)
            summary['errors'] += 1
            continue

        if upload_log.get('status') != 'UPLOADING':
            summary['skipped'] += 1
            continue

        try:
            if not dry_run:
                api.update_dataset_upload_log(
                    dataset_id=dataset_id,
                    log_data={
                        'status': 'PERMANENTLY_FAILED',
                        'metadata': {
                            'failure_reason': (
                                f'Upload exceeded stale threshold ({age_days:.1f} day(s)) in UPLOADING '
                                'state and was permanently failed by cleanup guard.'
                            ),
                        },
                    },
                )
            summary['marked_permanently_failed'] += 1
        except Exception:
            logger.exception('Failed setting PERMANENTLY_FAILED for dataset_id=%s', dataset_id)
            summary['errors'] += 1
            continue

        try:
            files_removed, trees_removed = _remove_stale_uploading_artifacts(upload_log, upload_roots, dry_run)
            summary['artifact_files_removed'] += files_removed
            summary['payload_trees_removed'] += trees_removed
        except Exception:
            logger.exception('Failed deleting stale UPLOADING artifacts for dataset_id=%s', dataset_id)
            summary['errors'] += 1

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Purge TUS staging artifacts and archived upload payloads.',
    )
    parser.add_argument('--ttl-days', type=float, default=14.0, help='Age threshold in days (default: 14).')
    parser.add_argument(
        '--stale-uploading-days',
        type=float,
        default=14.0,
        help='Age threshold in days for stale UPLOADING permanent-failure guard (default: 14).',
    )
    parser.add_argument('--dry-run', action='store_true', help='Log actions without deleting files.')
    parsed_args = parser.parse_args()
    args: CliArgs = {
        'ttl_days': float(parsed_args.ttl_days),
        'stale_uploading_days': float(parsed_args.stale_uploading_days),
        'dry_run': bool(parsed_args.dry_run),
    }

    upload_roots = _discover_upload_roots()
    cutoff_ts: float = time.time() - (args['ttl_days'] * 24 * 60 * 60)

    logger.info('Starting upload purge')
    logger.info('Upload roots: %s', ', '.join(str(p) for p in sorted(upload_roots, key=str)))
    logger.info('TTL days: %s', args['ttl_days'])
    logger.info('Stale UPLOADING days: %s', args['stale_uploading_days'])
    logger.info('Dry-run: %s', args['dry_run'])
    logger.info('Protected payload dir names: %s', ', '.join(sorted(PROTECTED_DIRS)))

    existing_roots = [p for p in upload_roots if p.exists()]
    if not existing_roots:
        logger.info('No upload root exists on this host; nothing to purge.')
        return

    stale_uploading_summary = fail_stale_uploading_sessions(
        args['stale_uploading_days'],
        set(existing_roots),
        args['dry_run'],
    )

    top_level_summary: TopLevelPurgeSummary = {'deleted': 0, 'skipped': 0, 'errors': 0}
    sidecar_summary: UploadedDataPurgeSummary = {
        'terminal_deleted': 0,
        'orphan_deleted': 0,
        'dirs_removed': 0,
        'skipped': 0,
        'errors': 0,
    }
    for upload_root in existing_roots:
        for protected in PROTECTED_DIRS:
            p = upload_root / protected
            if p.exists():
                logger.info('Payload directory present: %s', p)

        top = purge_top_level_staging(upload_root, cutoff_ts, args['dry_run'])
        for key in top_level_summary:
            top_level_summary[key] += top[key]

        side = purge_uploaded_data_sidecars(upload_root, args['dry_run'])
        for key in sidecar_summary:
            sidecar_summary[key] += side[key]

    payload_summary: PayloadPurgeSummary = purge_archived_upload_payloads(set(existing_roots), args['dry_run'])

    logger.info('Purge complete')
    logger.info('Stale UPLOADING guard summary: %s', stale_uploading_summary)
    logger.info('Top-level staging summary: %s', top_level_summary)
    logger.info('uploaded_data sidecar summary: %s', sidecar_summary)
    logger.info('Archived payload trees summary: %s', payload_summary)


if __name__ == '__main__':
    main()

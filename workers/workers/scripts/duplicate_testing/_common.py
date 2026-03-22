"""
Shared utilities for the duplicate-detection manual test scripts.

All scripts in this package must run inside the celery_worker container:

    docker compose exec celery_worker python -m workers.scripts.duplicate_testing.case_01_before_inspection

All dataset directories are created under:
    config['registration']['RAW_DATA']['duplicates_testing_dir']
    → /opt/sca/data/duplicates_testing  (docker environment)

Datasets are registered as ON_DEMAND RAW_DATA via the API and the integrated
workflow is started immediately after.  The scripts poll the API for state
transitions and log progress throughout.

File sizing:
    Each file is FILE_SIZE_BYTES (64 KB by default).  The minimum_dataset_size
    config value (10 MB in Docker) is only referenced in the config dict and is
    not enforced by any task, so small files work fine.  await_stability only
    checks time stability, not size.

await_stability wait:
    In Docker the recency_threshold_seconds = 60 (lowered for test speed), so
    every dataset takes at least 1 minute to move from REGISTERED → READY.
    Scripts that must wait for the original to be INSPECTED before registering
    the duplicate will take approximately 3–5 minutes total.  All scripts print
    expected wait times.
"""

import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import workers.api as api
from workers.config import config

logger = logging.getLogger(__name__)

DATASET_TYPE = 'RAW_DATA'

# Base directory for all test dataset files — separate from the watch.py
# source_dir so auto-registration never fires on these test directories.
BASE_DIR = Path(config['registration']['RAW_DATA']['duplicates_testing_dir'])

# Individual file size (bytes).  64 KB is small enough to run quickly but large
# enough to produce meaningful MD5 checksums.
FILE_SIZE_BYTES = 64 * 1024


# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

def setup_logging(level: str = 'INFO') -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format='%(asctime)s [%(levelname)s] %(name)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )


# ---------------------------------------------------------------------------
# Run identifier
# ---------------------------------------------------------------------------

def run_tag() -> str:
    """Short timestamp tag appended to dataset names to make them unique per run."""
    return datetime.now().strftime('%Y%m%d-%H%M%S')


# ---------------------------------------------------------------------------
# File creation helpers
# ---------------------------------------------------------------------------

def _file_block(label: str, size: int = FILE_SIZE_BYTES) -> bytes:
    """
    Deterministic file content block uniquely identified by LABEL.

    The first 64 bytes encode the label (zero-padded); the remainder is zeros.
    Different labels produce different MD5 checksums even though bodies are zeros.
    """
    header = label.encode('utf-8')[:64].ljust(64, b'\x00')
    body = bytes(size - len(header))
    return header + body


def _file_block_versioned(label: str, version: int, size: int = FILE_SIZE_BYTES) -> bytes:
    """
    Deterministic file content where both LABEL and VERSION affect the MD5.

    Two calls with the same LABEL but different VERSION values produce blocks
    with different MD5 checksums, simulating a file that was modified between
    the original and incoming dataset versions.  Calling with the same LABEL
    and the same VERSION always returns the same bytes (deterministic).
    """
    versioned_label = f'{label}-v{version}'
    header = versioned_label.encode('utf-8')[:64].ljust(64, b'\x00')
    body = bytes(size - len(header))
    return header + body


def make_dataset_dir(directory: Path, file_names: list[str]) -> None:
    """
    Create DIRECTORY and populate it with deterministic test files.

    Each file in FILE_NAMES is written with content derived from its own name,
    so files with the same name across different calls will have the same MD5
    (enabling controlled Jaccard scores), while files with different names will
    have different MD5s (simulating distinct files).
    """
    directory.mkdir(parents=True, exist_ok=True)
    for name in file_names:
        fpath = directory / name
        fpath.write_bytes(_file_block(name))
    logger.info(f'Created {len(file_names)} file(s) in {directory}')
    for name in file_names:
        logger.debug(f'  {directory / name}')


def make_dataset_dir_mixed(
    directory: Path,
    shared_files: list[str],
    versioned_files: dict[str, int],
) -> None:
    """
    Create DIRECTORY with two kinds of files:

      - SHARED_FILES: content is derived from the filename alone.  Two datasets
        built with the same SHARED_FILES list will have identical MD5s for every
        shared file (these count toward EXACT_CONTENT_MATCHES and typically
        SAME_PATH_SAME_CONTENT in the comparison report).

      - VERSIONED_FILES: maps filename → version number.  Two datasets that each
        include the same filename but with different version numbers produce
        different MD5 checksums for that file (these count as
        SAME_PATH_DIFFERENT_CONTENT in the comparison report).

    This helper is used by test cases that need to exercise the
    SAME_PATH_DIFFERENT_CONTENT comparison category.
    """
    directory.mkdir(parents=True, exist_ok=True)
    for name in shared_files:
        (directory / name).write_bytes(_file_block(name))
    for name, version in versioned_files.items():
        (directory / name).write_bytes(_file_block_versioned(name, version))
    total = len(shared_files) + len(versioned_files)
    logger.info(f'Created {total} file(s) in {directory} '
                f'({len(shared_files)} shared, {len(versioned_files)} versioned)')


def make_dataset_dir_with_content_keys(
    directory: Path,
    file_specs: list[tuple[str, str]],
) -> None:
    """
    Create DIRECTORY with explicit (path, content_key) pairs.

    file_specs entries are tuples: (relative_path, content_key).
    The output file path comes from relative_path, while the file bytes are
    derived from content_key.  This lets tests simulate moved/renamed files:
    different paths can intentionally carry identical content (same MD5).
    """
    directory.mkdir(parents=True, exist_ok=True)
    for relative_path, content_key in file_specs:
        fpath = directory / relative_path
        fpath.parent.mkdir(parents=True, exist_ok=True)
        fpath.write_bytes(_file_block(content_key))
    logger.info(f'Created {len(file_specs)} file(s) in {directory} using explicit content keys')


# ---------------------------------------------------------------------------
# Dataset registration
# ---------------------------------------------------------------------------

def register_and_start(name: str, origin_path: Path) -> dict[str, Any]:
    """
    Create a dataset record via the API and kick off the integrated workflow.
    Returns the created dataset dict.
    """
    payload = {
        'name': name,
        'type': DATASET_TYPE,
        'origin_path': str(origin_path),
        'create_method': 'ON_DEMAND',
    }
    dataset = api.create_dataset(payload)
    api.initiate_workflow(dataset_id=dataset['id'], workflow_name='integrated')
    logger.info(f'Registered "{name}" (id={dataset["id"]}) → {origin_path}')
    return dataset


def find_unique_name(base_name: str) -> str:
    """
    Return a dataset name that does not yet exist in the system.

    Checks BASE_NAME via the API.  If taken, appends -run2, -run3, … until a
    free slot is found.  This prevents 409 errors when re-running scripts after
    previous test datasets are still present in the database.
    """
    candidate = base_name
    counter = 2
    while api.dataset_name_exists(candidate, DATASET_TYPE):
        candidate = f'{base_name}-run{counter}'
        counter += 1
    return candidate


def duplicate_name_and_dir(original: dict[str, Any], seq: int = 1) -> tuple[str, Path]:
    """
    Return (name, directory_path) for a duplicate of ORIGINAL.

    The name embeds the original's ID and the _DUPLICATE_ token.  The token is
    required by the inspect task to record NOT_DUPLICATE entries for near-miss
    datasets (Jaccard below threshold) — without it the near-miss is silently
    ignored.  For full-match cases the token has no effect on detection.

    SEQ distinguishes multiple duplicates of the same original (default 1).

    find_unique_name ensures no 409 conflict when the script is re-run while
    old test datasets remain in the database.
    """
    base = f'{original["name"]}--copy-id{original["id"]}_DUPLICATE_{seq}'
    name = find_unique_name(base)
    return name, BASE_DIR / name


# ---------------------------------------------------------------------------
# State polling
# ---------------------------------------------------------------------------

def latest_state(dataset_id: int) -> str | None:
    """Return the most-recent state string for the dataset, or None."""
    ds = api.get_dataset(dataset_id=dataset_id)
    states = ds.get('states') or []
    return states[0]['state'] if states else None


def wait_for_state(
    dataset_id: int,
    target_states: list[str],
    timeout: int = 1200,
    poll_interval: int = 15,
    label: str = '',
) -> bool:
    """
    Poll until the dataset reaches one of TARGET_STATES or TIMEOUT is exceeded.
    Returns True if the target state was reached, False on timeout.

    LABEL is used only for log messages (e.g. the dataset name).
    """
    tag = label or f'id={dataset_id}'
    elapsed = 0
    while elapsed < timeout:
        state = latest_state(dataset_id)
        logger.info(f'[{tag}] state={state}  ({elapsed}s / {timeout}s)')
        if state in target_states:
            logger.info(f'[{tag}] reached target state: {state}')
            return True
        time.sleep(poll_interval)
        elapsed += poll_interval
    logger.warning(f'[{tag}] timed out after {timeout}s waiting for {target_states}')
    return False


def jaccard_note(
    total_incoming: int,
    total_original: int,
    common: int,
) -> str:
    """Human-readable Jaccard summary for log messages."""
    denominator = total_incoming + total_original - common
    score = common / denominator if denominator else 0.0
    return (
        f'{score:.3f} = {common} / ({total_incoming} + {total_original} - {common})'
        f' = {common}/{denominator}'
    )

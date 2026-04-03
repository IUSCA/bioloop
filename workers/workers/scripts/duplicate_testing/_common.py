"""
Shared utilities for the duplicate-detection manual test scripts.

All scripts in this package must run inside the celery_worker container:

    docker compose exec celery_worker python -m workers.scripts.duplicate_testing.case_01_before_inspection

All dataset directories are created under:
    $DUPLICATE_TESTING_BASE_DIR if set; otherwise Docker uses
    registration.RAW_DATA.duplicates_testing_dir from workers config; otherwise
    /tmp/duplicate_testing.

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
import os
import shutil
import secrets
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import workers.api as api
from workers.config import config

logger = logging.getLogger(__name__)

DATASET_TYPE = 'RAW_DATA'

# Base directory for all test dataset files.
#
# Prefer the configured duplicates_testing_dir in Docker so paths match the
# tree excluded from watch.py (see workers.config.*.registration.RAW_DATA).
# /tmp remains the fallback when no env override and no config path.
def _duplicate_testing_base_dir() -> Path:
    env = os.getenv('DUPLICATE_TESTING_BASE_DIR')
    if env:
        return Path(env)
    dup_dir = (
        config.get('registration', {})
        .get('RAW_DATA', {})
        .get('duplicates_testing_dir')
    )
    if dup_dir:
        return Path(dup_dir)
    return Path('/tmp/duplicate_testing')


BASE_DIR = _duplicate_testing_base_dir()

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
    """
    Tag appended to dataset names so each script invocation is unique.

    Second-resolution timestamps alone collide when simulate_all_test_cases runs
    cases in parallel threads (all threads share the same wall second).
    """
    return f'{datetime.now().strftime("%Y%m%d-%H%M%S")}-{secrets.token_hex(4)}'


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
    initial_name = name
    name_basis = name
    candidate_name = name
    candidate_path = origin_path
    max_attempts = 15

    for _ in range(max_attempts):
        # Use /datasets/:type/:name/exists via dataset_name_exists() to avoid
        # known name collisions before create, and still handle race-time 409.
        next_unique_name = find_unique_name(name_basis)
        if next_unique_name != candidate_name:
            next_path = origin_path.parent / next_unique_name
            if candidate_path.exists() and candidate_path != next_path and not next_path.exists():
                candidate_path.rename(next_path)
            candidate_name = next_unique_name
            candidate_path = next_path

        payload = {
            'name': candidate_name,
            'type': DATASET_TYPE,
            'origin_path': str(candidate_path),
            'create_method': 'ON_DEMAND',
        }
        try:
            dataset = api.create_dataset(payload)
            api.initiate_workflow(dataset_id=dataset['id'], workflow_name='integrated')
            logger.info(f'Registered "{candidate_name}" (id={dataset["id"]}) → {candidate_path}')
            return dataset
        except api.DatasetAlreadyExistsError:
            logger.warning(
                f'Name conflict while registering "{candidate_name}". Retrying with a new unique name.'
            )
            # Pick a fresh basis so the next find_unique_name() is not stuck on the same
            # candidate when the exists check and create disagree (e.g. races). Use one
            # suffix per retry so paths do not grow without bound.
            name_basis = f'{initial_name}-{secrets.token_hex(4)}'
            next_path = origin_path.parent / name_basis
            if candidate_path.exists() and candidate_path != next_path and not next_path.exists():
                candidate_path.rename(next_path)
            candidate_name = name_basis
            candidate_path = next_path
            time.sleep(0.5)

    raise RuntimeError(
        f'Could not register dataset "{initial_name}" from "{origin_path}" '
        f'after {max_attempts} attempts.'
    )


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


def purge_duplicate_testing_artifacts() -> None:
    """
    Remove prior duplicate-testing datasets and directories.

    Old runs can cause new "original" datasets to be immediately flagged as
    duplicates, which breaks expected state transitions for these scripted cases.
    Cleanup is scoped to names/paths used by this duplicate-testing package.
    """
    # Delete dataset records first so state/workflow links are cleaned up.
    for prefix in ('dup-test--', 'dup-test-'):
        datasets = api.get_all_datasets(
            dataset_type=DATASET_TYPE,
            name=prefix,
            deleted=False,
            match_name_exact=False,
        )
        for ds in datasets:
            try:
                api.delete_dataset(ds['id'])
                logger.info(f'Deleted prior duplicate-testing dataset id={ds["id"]} name={ds["name"]}')
            except Exception as exc:
                logger.warning(f'Failed deleting dataset id={ds["id"]}: {exc}')

    # Remove leftover directories under BASE_DIR that match test naming.
    if BASE_DIR.exists():
        for child in BASE_DIR.iterdir():
            if child.is_dir() and (child.name.startswith('dup-test--') or child.name.startswith('dup-test-')):
                shutil.rmtree(child, ignore_errors=True)
                logger.info(f'Removed prior duplicate-testing directory: {child}')


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
    timeout: int = 300,
    poll_interval: int = 5,
    label: str = '',
    fail_fast_states: list[str] | None = None,
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
        # When INSPECTED is expected for an original dataset, duplicate states
        # are an unexpected terminal path and waiting longer is not useful.
        if (
            'INSPECTED' in target_states
            and state in {'DUPLICATE_REGISTERED', 'DUPLICATE_READY', 'DUPLICATE_REJECTED'}
        ):
            logger.warning(
                f'[{tag}] reached {state} while waiting for INSPECTED; stopping early.'
            )
            return False
        if fail_fast_states and state in fail_fast_states:
            logger.warning(
                f'[{tag}] reached fail-fast state {state} while waiting for {target_states}.'
            )
            return False
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

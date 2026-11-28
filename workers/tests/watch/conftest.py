"""
Fixtures for watch.py integration tests.

These tests run against real Docker services (API, Postgres, Redis, Celery).
They test the full Observer -> Register -> API -> Rhythm chain.

Requirements:
    - APP_ENV=docker (or equivalent) in workers/.env
    - Docker stack running: api, postgres, redis, celery worker, rhythm

Fixture chains
--------------
Two parallel chains are provided:

  Parameterized (both dataset types) — for tests that must run once per type:
    dataset_type  →  watched_dir  →  type_observer  →  registered_dataset

  Single-type (RAW_DATA only) — for tests that don't vary by type:
    primary_dataset_type  →  primary_watched_dir  →  primary_type_observer
                          →  primary_registered_dataset

Each chain shares the same implementation via helper generators/factories.

Isolation strategy
------------------
Each test gets a uniquely-named isolation directory (_testObservedPath_*)
inside source_dir.  The test Observer watches that directory, so `origin_path`
for registered datasets takes the form:

    source_dir/_testObservedPath_<uuid>/testDataset_<uuid>

The _testObservedPath_* prefix is listed in the `rejects` config
(workers/workers/config/docker.py) so the production watch service does not
auto-register test isolation directories as real datasets.

Session-level cleanup
---------------------
Two separate purge strategies are used to avoid deleting data created by other
test processes or files:

  Pre-session  — prefix-based query (testDataset_*): removes orphaned datasets
                 left over from previously crashed runs of THIS suite whose IDs
                 are unknown.  Best-effort; errors are logged as warnings.

  Post-session — ID-based: deletes only the dataset IDs registered during THIS
                 session, tracked in _SESSION_DATASET_IDS.  Never touches
                 datasets created by other test processes or files.

Fixture teardown does not swallow exceptions — cleanup failures fail the test
immediately.
"""

import logging
import os
import shutil
import uuid
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest

import workers.api as api
from workers.config import config
from workers.scripts.watch import Register
from workers.services.watchlib import Observer

logger = logging.getLogger(__name__)

# Seconds passed as recency_threshold to await_stability via wf.start() kwargs.
# Override via env var: WATCH_TEST_RECENCY_THRESHOLD=10 poetry run pytest ...
_RECENCY_THRESHOLD: int = int(os.getenv('WATCH_TEST_RECENCY_THRESHOLD', '5'))

# Container-only path; these tests run in Docker only.
FIXTURES_DIR: Path = Path('/tmp/bioloop_watch_test_fixtures')

# Fixture directory name per dataset type. Created on first use if missing.
_FIXTURE_DIR_BY_TYPE: dict[str, Path] = {
    'RAW_DATA': FIXTURES_DIR / 'raw_data_type_dataset',
    'DATA_PRODUCT': FIXTURES_DIR / 'data_product_type_dataset',
}


def _ensure_fixture_dirs() -> None:
    """Create fixture dirs with a small placeholder file if missing so copytree works.

    The file must have size > 0 so the integrated workflow's inspect step sets
    du_size/size/num_files > 0 and test_integrated_workflow_steps_all_succeed passes.
    """
    for path in _FIXTURE_DIR_BY_TYPE.values():
        path.mkdir(parents=True, exist_ok=True)
        placeholder = path / '.placeholder'
        if not placeholder.exists() or placeholder.stat().st_size == 0:
            placeholder.write_bytes(b'x')


_ensure_fixture_dirs()

# Prefix shared by all test-generated dataset directories.
# Used by the session-level purge to find and clean up leftovers.
_TEST_DATASET_PREFIX: str = 'testDataset_'

# Prefix for per-test isolation directories inside source_dir.
# Directories with this prefix are excluded from production watch.py
# registration (see `rejects` in workers/workers/config/docker.py).
_TEST_OBSERVED_PATH_PREFIX: str = '_testObservedPath_'

# IDs of every dataset registered by this test session.
# The post-session purge deletes only these IDs so it never touches datasets
# created by other test processes or files running concurrently.
_SESSION_DATASET_IDS: list[int] = []


# ---------------------------------------------------------------------------
# Session-level dataset purge
# ---------------------------------------------------------------------------

def _purge_orphaned_datasets() -> None:
    """Delete test datasets that appear orphaned (best-effort, pre-session only).

    Queries by name prefix to find datasets left over from previously crashed
    runs of this suite whose IDs were never recorded.  Errors are caught and
    logged as warnings — this must not block test startup.

    WARNING: uses a broad prefix query and may match datasets created by other
    test suites that share the same naming convention.  It is intentionally
    limited to the pre-session pass where the risk of collision with a live
    concurrent run is low.
    """
    try:
        found: list[dict[str, Any]] = api.get_all_datasets(
            name=_TEST_DATASET_PREFIX,
            match_name_exact=False,
        )
    except Exception as e:
        logger.warning(f'_purge_orphaned_datasets: could not query API: {e}')
        return

    if not found:
        return

    logger.info(f'Pre-session: purging {len(found)} orphaned test dataset(s): '
                f'{[d["name"] for d in found]}')

    for dataset in found:
        dataset_id = dataset['id']
        try:
            current = api.get_dataset(dataset_id=dataset_id)
            if current.get('archive_path'):
                api.update_dataset(
                    dataset_id=dataset_id,
                    update_data={'archive_path': None},
                )
                logger.info(f'  Cleared archive_path for id={dataset_id}')
            api.delete_dataset(dataset_id)
            logger.info(
                f'  Purged orphan: id={dataset_id} name={dataset["name"]} '
                f'type={dataset.get("type")}'
            )
        except Exception as e:
            logger.warning(f'  Failed to purge orphan id={dataset_id}: {e}')


def _purge_session_datasets() -> None:
    """Delete only the datasets registered during this session (post-session).

    Uses _SESSION_DATASET_IDS — populated by _registered_dataset_gen as each
    dataset is created — so only this session's datasets are touched.  Safe to
    run concurrently with other test processes.
    """
    if not _SESSION_DATASET_IDS:
        return

    logger.info(f'Post-session: purging {len(_SESSION_DATASET_IDS)} session '
                f'dataset(s): {_SESSION_DATASET_IDS}')

    for dataset_id in list(_SESSION_DATASET_IDS):
        try:
            current = api.get_dataset(dataset_id=dataset_id)
            if current.get('archive_path'):
                api.update_dataset(
                    dataset_id=dataset_id,
                    update_data={'archive_path': None},
                )
                logger.info(f'  Cleared archive_path for id={dataset_id}')
            api.delete_dataset(dataset_id)
            _SESSION_DATASET_IDS.remove(dataset_id)
            logger.info(f'  Purged: id={dataset_id}')
        except Exception as e:
            logger.warning(f'  Failed to purge id={dataset_id}: {e}')


@pytest.fixture(scope='session', autouse=True)
def _purge_leftover_test_datasets() -> Generator[None, None, None]:
    """Session-scoped autouse: pre- and post-session dataset cleanup.

    Pre-session:  prefix-based orphan sweep for datasets left by crashed runs.
    Post-session: ID-based sweep limited to datasets created by this session.
    """
    logger.info('Pre-session: sweeping for orphaned test datasets...')
    _purge_orphaned_datasets()
    yield
    logger.info('Post-session: purging this session\'s remaining datasets...')
    _purge_session_datasets()


# ---------------------------------------------------------------------------
# Shared fixture implementation helpers
# ---------------------------------------------------------------------------

def _watched_dir_gen(dataset_type: str) -> Generator[Path, None, None]:
    """Setup/teardown: create and remove a per-test isolation directory inside source_dir.

    Each test gets its own uniquely-named directory so Observer state from one
    test cannot bleed into another — the test Observer only ever sees datasets
    created by the current test.
    """
    source_dir: Path = Path(config['registration'][dataset_type]['source_dir'])
    test_session_dir: Path = (
        source_dir if source_dir.exists() else Path('/tmp/bioloop_watch_tests')
    ) / f'{_TEST_OBSERVED_PATH_PREFIX}{uuid.uuid4().hex[:12]}'

    if not source_dir.exists():
        logger.warning(
            f'source_dir {source_dir} not found. '
            f'Falling back to {test_session_dir}. '
            f'Celery tasks that access origin_path may fail outside Docker.'
        )

    test_session_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f'[watched_dir] Created isolation dir: {test_session_dir} (type={dataset_type})')
    yield test_session_dir

    if test_session_dir.exists():
        shutil.rmtree(test_session_dir)
        logger.info(f'[watched_dir] Removed isolation dir: {test_session_dir}')


def _make_type_observer(dataset_type: str, watched_dir: Path) -> Observer:
    """Create and initialize an Observer wired to a Register for dataset_type."""
    register: Register = Register(
        dataset_type=dataset_type,
        default_wf_name='integrated',
        wf_start_kwargs={'recency_threshold': _RECENCY_THRESHOLD},
    )
    obs: Observer = Observer(
        name=f'test_{dataset_type.lower()}_observer',
        dir_path=str(watched_dir),
        callback=register.register,
        interval=1,
    )
    # Establish initial state: Observer sees an empty directory.
    obs.watch()
    logger.info(
        f'[type_observer] Initialized with empty dir: {watched_dir} (type={dataset_type})'
    )
    return obs


def _registered_dataset_gen(
    dataset_type: str,
    watched_dir: Path,
    type_observer: Observer,
) -> Generator[dict[str, Any], None, None]:
    """Setup/teardown: copy fixture, trigger Observer, yield dataset; delete on teardown.

    Teardown clears archive_path before deleting (if it was set) so the API's
    soft-delete takes the direct-DB path — synchronous, without queuing an
    asynchronous archive-delete workflow via Celery.

    Errors are NOT swallowed: a failed teardown fails the test so problems
    are never silently ignored.
    """
    dataset_name: str = f'{_TEST_DATASET_PREFIX}{uuid.uuid4().hex[:12]}'
    dataset_path: Path = watched_dir / dataset_name

    fixture_src: Path = _FIXTURE_DIR_BY_TYPE[dataset_type]
    shutil.copytree(fixture_src, dataset_path)
    logger.info(f'[registered_dataset] Copied {dataset_type} fixture → {dataset_path}')

    type_observer.watch()
    logger.info(
        f'[registered_dataset] Observer.watch() fired — '
        f'expecting registration of: {dataset_name} (type={dataset_type})'
    )

    matches: list[dict[str, Any]] = api.get_all_datasets(
        dataset_type=dataset_type,
        name=dataset_name,
        match_name_exact=True,
    )
    if not matches:
        pytest.fail(
            f'Dataset "{dataset_name}" (type={dataset_type}) not found in the API '
            f'after Observer.watch(). Check API reachability and APP_API_TOKEN.'
        )

    dataset: dict[str, Any] = api.get_dataset(
        dataset_id=matches[0]['id'],
        workflows=True,
        include_audit_logs=True,
    )

    workflow_ids: list[str] = [wf['id'] for wf in dataset.get('workflows', [])]
    logger.info(
        f'[registered_dataset] Registered — '
        f'id={dataset["id"]} name={dataset["name"]} type={dataset_type} '
        f'origin_path={dataset["origin_path"]} '
        f'create_method={dataset.get("create_method")} '
        f'workflow_ids={workflow_ids}'
    )

    # Track this ID so the post-session purge only deletes datasets created
    # by this session, not datasets from other concurrently running tests.
    _SESSION_DATASET_IDS.append(dataset['id'])

    yield {'dataset': dataset, 'path': dataset_path}

    # ---- teardown --------------------------------------------------------
    current = api.get_dataset(dataset_id=dataset['id'])
    if current.get('archive_path'):
        api.update_dataset(dataset_id=dataset['id'], update_data={'archive_path': None})
        logger.info(
            f'[registered_dataset] Cleared archive_path for id={dataset["id"]} '
            f'before deletion'
        )
    api.delete_dataset(dataset['id'])
    logger.info(
        f'[registered_dataset] Deleted — '
        f'id={dataset["id"]} name={dataset["name"]} type={dataset_type}'
    )


# ---------------------------------------------------------------------------
# Parameterized fixtures — both dataset types
# ---------------------------------------------------------------------------

@pytest.fixture(params=['RAW_DATA', 'DATA_PRODUCT'], scope='function')
def dataset_type(request: pytest.FixtureRequest) -> str:
    """Parameterized over all supported dataset types."""
    return request.param


@pytest.fixture(scope='function')
def watched_dir(dataset_type: str) -> Generator[Path, None, None]:
    yield from _watched_dir_gen(dataset_type)


@pytest.fixture(scope='function')
def type_observer(dataset_type: str, watched_dir: Path) -> Observer:
    return _make_type_observer(dataset_type, watched_dir)


@pytest.fixture(scope='function')
def registered_dataset(
    dataset_type: str,
    watched_dir: Path,
    type_observer: Observer,
) -> Generator[dict[str, Any], None, None]:
    yield from _registered_dataset_gen(dataset_type, watched_dir, type_observer)


# ---------------------------------------------------------------------------
# Single-type fixtures — RAW_DATA only
# Used by tests whose assertions are independent of dataset type.
# ---------------------------------------------------------------------------

@pytest.fixture(scope='function')
def primary_dataset_type() -> str:
    """RAW_DATA — used by tests whose behavior is independent of dataset type."""
    return 'RAW_DATA'


@pytest.fixture(scope='function')
def primary_watched_dir(primary_dataset_type: str) -> Generator[Path, None, None]:
    yield from _watched_dir_gen(primary_dataset_type)


@pytest.fixture(scope='function')
def primary_type_observer(primary_dataset_type: str, primary_watched_dir: Path) -> Observer:
    return _make_type_observer(primary_dataset_type, primary_watched_dir)


@pytest.fixture(scope='function')
def primary_registered_dataset(
    primary_dataset_type: str,
    primary_watched_dir: Path,
    primary_type_observer: Observer,
) -> Generator[dict[str, Any], None, None]:
    yield from _registered_dataset_gen(
        primary_dataset_type, primary_watched_dir, primary_type_observer
    )

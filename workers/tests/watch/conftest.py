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
A session-scoped autouse fixture runs _purge_test_datasets() both before and
after the full test session.  The pre-session pass removes leftovers from
previous runs; the post-session pass catches anything per-fixture teardown
may have missed.  Fixture teardown does not swallow exceptions — cleanup
failures fail the test immediately.
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

FIXTURES_DIR: Path = Path(__file__).parent / 'fixtures'

# Fixture directory name per dataset type.
_FIXTURE_DIR_BY_TYPE: dict[str, Path] = {
    'RAW_DATA': FIXTURES_DIR / 'raw_data_type_dataset',
    'DATA_PRODUCT': FIXTURES_DIR / 'data_product_type_dataset',
}

# Prefix shared by all test-generated dataset directories.
# Used by the session-level purge to find and clean up leftovers.
_TEST_DATASET_PREFIX: str = 'testDataset_'

# Prefix for per-test isolation directories inside source_dir.
# Directories with this prefix are excluded from production watch.py
# registration (see `rejects` in workers/workers/config/docker.py).
_TEST_OBSERVED_PATH_PREFIX: str = '_testObservedPath_'


# ---------------------------------------------------------------------------
# Session-level dataset purge
# ---------------------------------------------------------------------------

def _purge_test_datasets() -> None:
    """Delete all non-deleted test datasets from the API (best-effort).

    Queries for datasets whose name contains _TEST_DATASET_PREFIX across all
    types.      For each match the archive_path is cleared first (to avoid triggering the
    asynchronous archive-delete workflow) then the dataset is soft-deleted via the API.

    Errors are caught and logged as warnings — this is a best-effort safety
    net and must not mask test failures.
    """
    try:
        found: list[dict[str, Any]] = api.get_all_datasets(
            name=_TEST_DATASET_PREFIX,
            match_name_exact=False,
        )
    except Exception as e:
        logger.warning(f'_purge_test_datasets: could not query API: {e}')
        return

    if not found:
        return

    logger.info(f'Purging {len(found)} leftover test dataset(s): '
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
                f'  Purged: id={dataset_id} name={dataset["name"]} '
                f'type={dataset.get("type")}'
            )
        except Exception as e:
            logger.warning(f'  Failed to purge id={dataset_id}: {e}')


@pytest.fixture(scope='session', autouse=True)
def _purge_leftover_test_datasets() -> Generator[None, None, None]:
    """Session-scoped autouse: purge test datasets before and after the session.

    Pre-session pass removes leftovers from previously crashed runs.
    Post-session pass is the safety net for anything per-fixture teardown missed.
    """
    logger.info('Pre-session: purging any leftover test datasets...')
    _purge_test_datasets()
    yield
    logger.info('Post-session: purging any remaining test datasets...')
    _purge_test_datasets()


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

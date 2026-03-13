"""
Fixtures for watch.py integration tests.

These tests run against real Docker services (API, Postgres, Redis, Celery).
They test the full Observer -> Register -> API -> Rhythm chain.

Requirements:
    - APP_ENV=docker (or equivalent) in workers/.env
    - Docker stack running: api, postgres, redis, celery worker, rhythm
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
# Overrides the shared config value for this test's workflow invocation only,
# so docker.py/common.py thresholds are unaffected.
# Override via env var: WATCH_TEST_RECENCY_THRESHOLD=10 poetry run pytest ...
_RECENCY_THRESHOLD: int = int(os.getenv('WATCH_TEST_RECENCY_THRESHOLD', '5'))

FIXTURES_DIR: Path = Path(__file__).parent / 'fixtures'

# Fixture directory name per dataset type.
# RAW_DATA: includes CopyComplete.txt (required by await_stability for standard Illumina datasets).
# DATA_PRODUCT: no completion markers required.
_FIXTURE_DIR_BY_TYPE: dict[str, Path] = {
    'RAW_DATA': FIXTURES_DIR / 'raw_data_type_dataset',
    'DATA_PRODUCT': FIXTURES_DIR / 'data_product_type_dataset',
}


@pytest.fixture(scope='function')
def watched_dir(dataset_type: str) -> Generator[Path, None, None]:
    """
    A fresh isolated subdirectory inside the configured source_dir for this
    dataset_type (e.g. /opt/sca/data/origin/raw_data/_test_<uuid>/).

    Using the source_dir (a Docker landing_volume mount) ensures that both
    the test runner process and the Celery worker process share the same
    filesystem view of the dataset files via the same absolute path.

    If the source_dir does not exist (running outside Docker), falls back to
    a local temp directory with a warning. In that case tests that depend on
    Celery workers accessing origin_path will fail or behave unexpectedly.
    """
    source_dir: Path = Path(config['registration'][dataset_type]['source_dir'])
    test_session_dir: Path = (
        source_dir if source_dir.exists() else Path('/tmp/bioloop_watch_tests')
    ) / f'_test_{uuid.uuid4().hex[:12]}'

    if not source_dir.exists():
        logger.warning(
            f'source_dir {source_dir} not found. '
            f'Falling back to {test_session_dir}. '
            f'Celery tasks that access origin_path may fail outside Docker.'
        )

    test_session_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f'Created isolated test watch dir: {test_session_dir}')

    yield test_session_dir

    if test_session_dir.exists():
        shutil.rmtree(test_session_dir)
        logger.info(f'Removed test watch dir: {test_session_dir}')


@pytest.fixture(params=['RAW_DATA', 'DATA_PRODUCT'], scope='function')
def dataset_type(request: pytest.FixtureRequest) -> str:
    """
    Parameterized fixture providing each dataset type in turn.
    Tests that depend on this fixture run once per type.
    """
    return request.param


@pytest.fixture(scope='function')
def type_observer(
    dataset_type: str,
    watched_dir: Path,
) -> Observer:
    """
    An Observer instance watching watched_dir, wired to a Register for the
    current dataset_type.

    The Observer's first watch() call is made here (with an empty directory),
    establishing the initial known-state. Subsequent watch() calls in tests
    or in the registered_dataset fixture will detect newly added directories
    as 'add' events.

    This tests the Observer -> Register chain exactly as watch.py does in
    production, just without the Poller's blocking loop.
    """
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
    # This mirrors what happens when watch.py starts up before any datasets arrive.
    obs.watch()
    logger.info(f'Observer initialized with empty watched dir: {watched_dir} (type: {dataset_type})')
    return obs


@pytest.fixture(scope='function')
def registered_dataset(
    dataset_type: str,
    watched_dir: Path,
    type_observer: Observer,
) -> Generator[dict[str, Any], None, None]:
    """
    Creates a small real test dataset directory inside watched_dir (copied from
    tests/watch/fixtures/<type>_type_dataset/), then triggers one Observer.watch()
    cycle to simulate the watch script detecting a new dataset.

    Yields a dict with the registered dataset (fetched from API) and its
    filesystem path:
        {
            'dataset': <dataset dict from API>,
            'path': <Path to dataset directory>,
        }

    Teardown: deletes the dataset from the API and removes the directory.
    """
    dataset_name: str = f'test_watch_{uuid.uuid4().hex[:12]}'
    dataset_path: Path = watched_dir / dataset_name

    fixture_src: Path = _FIXTURE_DIR_BY_TYPE[dataset_type]
    shutil.copytree(fixture_src, dataset_path)
    logger.info(f'Copied {dataset_type} fixture to: {dataset_path}')

    # Trigger the Observer: it diffs current dirs against known state and
    # calls Register.register('add', [dataset_path]) for the new directory.
    type_observer.watch()
    logger.info(f'Observer.watch() triggered - should have registered: {dataset_name} (type: {dataset_type})')

    matches: list[dict[str, Any]] = api.get_all_datasets(
        dataset_type=dataset_type,
        name=dataset_name,
        match_name_exact=True,
    )
    if not matches:
        pytest.fail(
            f'Dataset "{dataset_name}" (type: {dataset_type}) was not found in the API '
            f'after Observer.watch(). Check API reachability and APP_API_TOKEN.'
        )

    dataset: dict[str, Any] = api.get_dataset(dataset_id=matches[0]['id'], workflows=True)
    logger.info(f'Registered dataset: id={dataset["id"]}, name={dataset["name"]}, type={dataset_type}')

    yield {'dataset': dataset, 'path': dataset_path}

    # Teardown: remove dataset record from API.
    # The dataset directory on disk is cleaned up by the watched_dir fixture
    # (it removes the entire test session dir).
    try:
        api.delete_dataset(dataset['id'])
        logger.info(f'Deleted test dataset from API: {dataset["id"]}')
    except Exception as e:
        logger.warning(f'Failed to delete test dataset {dataset["id"]} from API: {e}')

"""
Pytest Configuration and Shared Fixtures

Provides reusable hooks for all worker integration tests.
Tests run against Docker services (API, Postgres, Redis, Celery).
"""

import logging
from datetime import datetime
from pathlib import Path

import pytest

# Log output is configured in pytest.ini (log_file, log_file_level, log_cli).
# pytest_sessionstart below also writes a per-run timestamped file alongside
# the persistent watch_tests.log managed by pytest itself.
#
# Log locations (Docker):
#   container: /opt/sca/app/test_logs/
#   host:      workers/test_logs/   (volume: ./workers/:/opt/sca/app)
# Log locations (local/non-Docker):
#   workers/test_logs/
#
# Per-run file:   test_logs/test_run_YYYYMMDD_HHMMSS.log
# Persistent log: test_logs/watch_tests.log  (controlled by pytest.ini log_file)
TEST_LOGS_DIR: Path = Path(__file__).parent.parent / 'test_logs'

logging.getLogger().setLevel(logging.DEBUG)

logger: logging.Logger = logging.getLogger(__name__)


def pytest_sessionstart(session: pytest.Session) -> None:
    """
    Pytest hook: Add a per-run timestamped FileHandler to the root logger.

    This creates test_logs/test_run_YYYYMMDD_HHMMSS.log alongside the
    persistent watch_tests.log that pytest writes via pytest.ini log_file.
    Both files land in the same test_logs/ directory.
    """
    TEST_LOGS_DIR.mkdir(exist_ok=True)
    timestamp: str = datetime.now().strftime('%Y%m%d_%H%M%S')
    run_log_path: Path = TEST_LOGS_DIR / f'test_run_{timestamp}.log'

    handler: logging.FileHandler = logging.FileHandler(run_log_path)
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(
        logging.Formatter('%(asctime)s %(levelname)-8s %(name)s %(message)s')
    )
    logging.getLogger().addHandler(handler)

    logger.info("=" * 80)
    logger.info(f"TEST RUN STARTED: {timestamp}")
    logger.info(f"Per-run log:   {run_log_path}")
    logger.info(f"Persistent log: {TEST_LOGS_DIR / 'watch_tests.log'} (pytest.ini log_file)")
    logger.info("=" * 80)


def pytest_runtest_setup(item: pytest.Item) -> None:
    """
    Pytest hook: Log test start.
    """
    logger.info("\n" + "=" * 80)
    logger.info(f"TEST STARTED: {item.name}")
    logger.info(f"Module: {item.module.__name__}")
    logger.info("=" * 80)


def pytest_runtest_teardown(
    item: pytest.Item,
    nextitem: pytest.Item | None,
) -> None:
    """
    Pytest hook: Log test completion.
    """
    logger.info("=" * 80)
    logger.info(f"TEST COMPLETED: {item.name}")
    logger.info("=" * 80 + "\n")

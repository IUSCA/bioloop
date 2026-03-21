"""
Pytest Configuration and Shared Fixtures

Provides reusable hooks for all worker integration tests.
Tests run against Docker services (API, Postgres, Redis, Celery).
"""

import logging
from datetime import datetime
from pathlib import Path

import pytest

# Log output: pytest.ini log_file + per-run file. Container-only; tests run in Docker only.
TEST_LOGS_DIR: Path = Path('/tmp/bioloop_test_logs')

logging.getLogger().setLevel(logging.DEBUG)

logger: logging.Logger = logging.getLogger(__name__)


def pytest_configure(config: pytest.Config) -> None:
    """Send pytest log_file to container /tmp (tests run in Docker only)."""
    log_dir = Path('/tmp/bioloop_test_logs')
    log_dir.mkdir(exist_ok=True)
    config.option.log_file = str(log_dir / 'watch_tests.log')
    config.option.log_file_mode = 'a'


def pytest_sessionstart(session: pytest.Session) -> None:
    """
    Pytest hook: Add a per-run timestamped FileHandler to the root logger.
    Log dir is TEST_LOGS_DIR (/tmp in container).
    """
    TEST_LOGS_DIR.mkdir(parents=True, exist_ok=True)
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
    logger.info(f"Persistent log: {TEST_LOGS_DIR / 'watch_tests.log'}")
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
    Pytest hook: Log test completion (outcome logged separately via logreport).
    """
    logger.info("=" * 80)
    logger.info(f"TEST TEARDOWN: {item.name}")
    logger.info("=" * 80 + "\n")


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    """
    Pytest hook: Log the outcome (PASSED / FAILED / ERROR) for each test phase.

    Called once per phase (setup, call, teardown).  Only the 'call' phase
    carries the actual test result; 'setup' and 'teardown' failures are also
    surfaced so fixture errors are visible in the log.
    """
    if report.when == 'call':
        if report.passed:
            logger.info(f"OUTCOME PASSED  :: {report.nodeid}")
        elif report.failed:
            logger.error(
                f"OUTCOME FAILED  :: {report.nodeid}\n"
                f"{report.longreprtext if hasattr(report, 'longreprtext') else report.longrepr}"
            )
        elif report.skipped:
            logger.info(f"OUTCOME SKIPPED :: {report.nodeid}")
    elif report.when in ('setup', 'teardown') and report.failed:
        logger.error(
            f"OUTCOME ERROR ({report.when.upper()}) :: {report.nodeid}\n"
            f"{report.longreprtext if hasattr(report, 'longreprtext') else report.longrepr}"
        )

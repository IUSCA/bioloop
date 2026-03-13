"""
Integration tests: watch.py dataset registration -> integrated workflow kickoff.

Each test class runs once per dataset type (RAW_DATA, DATA_PRODUCT) via the
parameterized `dataset_type` fixture in conftest.py.

What is tested:
    - Observer detects a new directory in the watched path ('add' event)
    - Register.register() is called via the Observer callback
    - The API creates a dataset record with the correct type, origin_path,
      and create_method == 'SCAN'
    - An 'integrated' workflow is kicked off (created in Rhythm + linked to dataset)
    - A second Observer.watch() cycle does NOT re-register the same directory

What is NOT tested here:
    - Full workflow step execution (archive, validate, etc.) - those go in
      tests/watch/test_integrated_workflow_steps.py (to be written)
    - The Poller's scheduling loop - thin scheduling glue, not tested here

How it works:
    Observer.watch() is called directly (not via Poller's blocking loop).
    This is the deterministic equivalent of one polling cycle in watch.py.
    It tests the Observer -> Register -> API -> Rhythm chain in full.

Markers:
    integration       - requires running Docker stack
    watch_script      - tests specific to the watch.py script behavior
    requires_celery   - Celery worker must be running (workflow tasks are queued)

Skip configuration:
    Set SKIP_WATCH_SCRIPT_TESTS=true in workers/.env to skip these tests.
    Useful for forks that have customized registration or workflow logic.
"""

import logging
import os
import time
from pathlib import Path
from typing import Any

import pytest

import workers.api as api
from workers.config import config
from workers.services.watchlib import Observer

# Maximum seconds to wait for all workflow steps to reach SUCCESS.
# The integrated workflow includes archive + stage which can take real time
# even for tiny test datasets.  Keep well below the pytest timeout (600s).
_WORKFLOW_COMPLETION_TIMEOUT_SECONDS: int = 300

# How long to wait between polls when checking step progress.
# Steps take seconds-to-minutes each; polling more frequently than this
# wastes log noise without adding value.
_WORKFLOW_POLL_INTERVAL_SECONDS: float = 10.0

# Step statuses from which the workflow will never recover.
_TERMINAL_FAILURE_STATUSES: frozenset[str] = frozenset({'FAILED', 'FAILURE', 'REVOKED'})

logger = logging.getLogger(__name__)

_skip_watch_tests: bool = os.getenv('SKIP_WATCH_SCRIPT_TESTS', 'false').lower() == 'true'


@pytest.mark.integration
@pytest.mark.watch_script
@pytest.mark.requires_celery
@pytest.mark.skipif(_skip_watch_tests, reason='SKIP_WATCH_SCRIPT_TESTS=true in environment')
class TestWatchRegistration:
    """
    Tests that the watch script correctly detects new directories and registers
    datasets with the expected attributes and kicks off workflows.

    Runs for both RAW_DATA and DATA_PRODUCT via the parameterized dataset_type fixture.
    """

    def test_observer_detects_new_directory_and_creates_dataset(
        self,
        registered_dataset: dict[str, Any],
        dataset_type: str,
    ) -> None:
        """
        When a new directory appears in the watched path, the Observer should
        detect it as an 'add' event and the Register callback should create a
        dataset record via the API with:
            - correct type
            - origin_path pointing to the watched directory
            - create_method == 'SCAN'
        """
        dataset: dict[str, Any] = registered_dataset['dataset']
        dataset_path: Path = registered_dataset['path']

        assert dataset['id'] is not None
        assert dataset['type'] == dataset_type

        assert dataset['origin_path'] == str(dataset_path.resolve()), (
            f'Expected origin_path to be "{dataset_path.resolve()}", '
            f'got: "{dataset["origin_path"]}"'
        )

        assert dataset['create_method'] == 'SCAN', (
            f'Expected create_method to be "SCAN" for a watch-script-registered dataset, '
            f'got: "{dataset["create_method"]}"'
        )

        logger.info(
            f'Dataset created: id={dataset["id"]}, type={dataset_type}, '
            f'origin_path={dataset["origin_path"]}, create_method={dataset["create_method"]}'
        )

    def test_observer_detects_new_directory_and_triggers_integrated_workflow(
        self,
        registered_dataset: dict[str, Any],
        dataset_type: str,
    ) -> None:
        """
        After Observer detects a new directory, exactly one 'integrated' workflow
        should be linked to the dataset in Postgres and visible via Rhythm.

        Asserts:
            - Exactly 1 workflow is linked to the dataset (Postgres: prisma.workflow)
            - Workflow name is 'integrated' (Rhythm-enriched)
            - Step count and step names match config['workflow_registry']['integrated']['steps']
              — the single source of truth for the workflow definition

        Uses GET /workflows?dataset_id=<id> which:
            - Returns { total: 0, results: [] } from Postgres alone when no workflow
              exists (no Rhythm call -> no silent false negative).
            - Returns Rhythm-enriched results when a workflow does exist; if Rhythm is
              unreachable the API raises 5xx -> raise_for_status() fails loudly here
              rather than returning an empty list.

        The POST /datasets/:id/workflows call inside watch.py is synchronous, so the
        Postgres record exists by the time Observer.watch() returns. No polling needed.
        """
        dataset: dict[str, Any] = registered_dataset['dataset']

        result: dict[str, Any] = api.get_workflows_for_dataset(
            dataset_id=dataset['id'],
        )
        total: int = result.get('metadata', {}).get('total', 0)
        workflows: list[dict[str, Any]] = result.get('results', [])

        assert total == 1, (
            f'Expected exactly 1 workflow for dataset {dataset["id"]} '
            f'(type: {dataset_type}), found {total}. '
            f'The integrated workflow was either not kicked off or kicked off more than once.'
        )
        assert len(workflows) == 1

        workflow: dict[str, Any] = workflows[0]
        assert workflow.get('name') == 'integrated', (
            f'Expected workflow name "integrated" for dataset {dataset["id"]} '
            f'(type: {dataset_type}), got: {workflow.get("name")!r}'
        )

        expected_steps: list[dict[str, Any]] = config['workflow_registry']['integrated']['steps']
        expected_step_names: list[str] = [s['name'] for s in expected_steps]
        actual_steps: list[dict[str, Any]] = workflow.get('steps', [])
        actual_step_names: list[str] = [s['name'] for s in actual_steps]

        assert len(actual_steps) == len(expected_steps), (
            f'Step count mismatch for workflow {workflow["id"]} '
            f'(dataset {dataset["id"]}, type: {dataset_type}). '
            f'Config defines {len(expected_steps)} steps, Rhythm returned {len(actual_steps)}. '
            f'Expected: {expected_step_names}, Got: {actual_step_names}'
        )
        assert actual_step_names == expected_step_names, (
            f'Step names mismatch for workflow {workflow["id"]} '
            f'(dataset {dataset["id"]}, type: {dataset_type}). '
            f'Expected: {expected_step_names}, Got: {actual_step_names}'
        )

        logger.info(
            f'Workflow kicked off: id={workflow["id"]}, name={workflow["name"]}, '
            f'steps={len(actual_steps)}, dataset_id={dataset["id"]}, type={dataset_type}'
        )

    @pytest.mark.slow
    @pytest.mark.integrated_wf
    def test_integrated_workflow_steps_all_succeed(
        self,
        registered_dataset: dict[str, Any],
        dataset_type: str,
    ) -> None:
        """
        After the integrated workflow is kicked off, all steps defined in
        config['workflow_registry']['integrated']['steps'] should eventually reach
        SUCCESS status.

        Polls GET /workflows/:id?last_task_runs=true&prev_task_runs=true until:
            - All config-defined steps are SUCCESS -> pass
            - Any step reaches a terminal failure (FAILED / REVOKED) -> fail immediately
            - Timeout (_WORKFLOW_COMPLETION_TIMEOUT_SECONDS) -> fail with step snapshot
            - Rhythm unreachable (API 5xx) -> raise_for_status() fails loudly;
              no silent empty-list behavior

        Step names are read from config (single source of truth). If the workflow
        definition changes, this test automatically validates the updated steps
        against the Rhythm response without any test code changes.

        If the Rhythm response contains a 'steps' key the Rhythm connection is
        working.  If 'steps' is absent the connection is broken and the test
        fails immediately with a clear message.
        """
        dataset: dict[str, Any] = registered_dataset['dataset']

        result: dict[str, Any] = api.get_workflows_for_dataset(
            dataset_id=dataset['id'],
        )
        workflows: list[dict[str, Any]] = result.get('results', [])

        if not workflows:
            pytest.fail(
                f'No workflow found for dataset {dataset["id"]} (type: {dataset_type}). '
                f'Cannot poll for step completion without a workflow.'
            )

        workflow_id: str = workflows[0]['id']
        expected_steps: list[dict[str, Any]] = config['workflow_registry']['integrated']['steps']
        expected_step_names: list[str] = [s['name'] for s in expected_steps]

        last_step_statuses: dict[str, str] = {}
        elapsed: float = 0.0

        while elapsed < _WORKFLOW_COMPLETION_TIMEOUT_SECONDS:
            wf: dict[str, Any] = api.get_workflow(
                workflow_id=workflow_id,
                last_task_runs=True,
                prev_task_runs=True,
            )

            steps: list[dict[str, Any]] | None = wf.get('steps')
            if steps is None:
                pytest.fail(
                    f'Rhythm API returned workflow {workflow_id} without a "steps" key. '
                    f'The API-to-Rhythm connection may be broken. '
                    f'Response keys present: {list(wf.keys())}'
                )

            last_step_statuses = {s['name']: s['status'] for s in steps}

            failed_steps: dict[str, str] = {
                name: status
                for name, status in last_step_statuses.items()
                if status in _TERMINAL_FAILURE_STATUSES
            }
            if failed_steps:
                pytest.fail(
                    f'Workflow {workflow_id} has steps in a terminal failure state '
                    f'for dataset {dataset["id"]} (type: {dataset_type}): {failed_steps}'
                )

            pending_steps: list[str] = [
                name for name in expected_step_names
                if last_step_statuses.get(name) != 'SUCCESS'
            ]
            if not pending_steps:
                logger.info(
                    f'All {len(expected_step_names)} steps succeeded for workflow '
                    f'{workflow_id}, dataset {dataset["id"]} (type: {dataset_type})'
                )
                return

            done_count: int = len(expected_step_names) - len(pending_steps)
            logger.debug(
                f'Workflow {workflow_id}: {done_count}/{len(expected_step_names)} steps done. '
                f'Still waiting: {pending_steps}'
            )

            time.sleep(_WORKFLOW_POLL_INTERVAL_SECONDS)
            elapsed += _WORKFLOW_POLL_INTERVAL_SECONDS

        pytest.fail(
            f'Workflow {workflow_id} did not complete within '
            f'{_WORKFLOW_COMPLETION_TIMEOUT_SECONDS}s for dataset '
            f'{dataset["id"]} (type: {dataset_type}). '
            f'Final step statuses: {last_step_statuses}'
        )

    def test_observer_does_not_register_same_directory_twice(
        self,
        registered_dataset: dict[str, Any],
        dataset_type: str,
        type_observer: Observer,
    ) -> None:
        """
        If the same directory is present in the watched path on a second
        Observer.watch() cycle, it should NOT attempt to register it again.

        The Observer's known-state diffing (added = current - known) prevents
        re-submission. DatasetAlreadyExistsError in register_candidate() is a
        secondary safety net but should never be reached here.
        """
        dataset_name: str = registered_dataset['dataset']['name']

        # Second watch cycle - the directory is already in the Observer's known state
        type_observer.watch()

        matches: list[dict[str, Any]] = api.get_all_datasets(
            dataset_type=dataset_type,
            name=dataset_name,
            match_name_exact=True,
        )
        assert len(matches) == 1, (
            f'Expected exactly 1 dataset named "{dataset_name}" (type: {dataset_type}), '
            f'but found {len(matches)}. Observer may have re-registered the directory.'
        )
        logger.info(
            f'Idempotency confirmed: "{dataset_name}" (type: {dataset_type}) exists exactly once'
        )

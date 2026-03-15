"""
Integration tests: watch.py dataset registration -> integrated workflow kickoff.

Test structure
--------------
Most tests run once (RAW_DATA only) via the `primary_registered_dataset` fixture —
dataset-type-specific behavior is orthogonal to the things they verify.

The single exception is `test_dataset_type_is_set_correctly`, which is
parameterized over all supported types to confirm that the type attribute is
set correctly for each one.

What is tested:
    - Observer detects a new directory in the watched path ('add' event)
    - Register.register() is called via the Observer callback
    - The API creates a dataset record with the correct type, origin_path,
      and create_method == 'SCAN'
    - origin_path is inside the configured source_dir for the dataset type
    - An 'integrated' workflow is kicked off (created in Rhythm + linked to dataset)
    - A second Observer.watch() cycle does NOT re-register the same directory
    - All workflow steps reach SUCCESS (slow test)
    - After the workflow: archive_path, staged_path, and bundle paths are
      verified against the helpers in workers/dataset.py and config values

What is NOT tested here:
    - The Poller's scheduling loop - thin scheduling glue, not tested here

How it works:
    Observer.watch() is called directly (not via Poller's blocking loop).
    This is the deterministic equivalent of one polling cycle in watch.py.

Markers:
    integration       - requires running Docker stack
    watch_script      - tests specific to the watch.py script behavior
    requires_celery   - Celery worker must be running (workflow tasks are queued)

-------------------------------------------------------------------------------
Running these tests
-------------------------------------------------------------------------------

Prerequisites:
    Docker stack must be running and healthy (api, celery_worker, rhythm, postgres).

        docker compose up -d
        docker compose ps       # confirm api, rhythm, signet are healthy

Run commands (from the repo root, inside the celery_worker container):

    # All tests in this file
    docker compose exec celery_worker pytest tests/watch/test_watch_registration.py

    # Skip the slow workflow-completion test
    docker compose exec celery_worker pytest tests/watch/test_watch_registration.py -m "not slow"

    # Only the slow test
    docker compose exec celery_worker pytest tests/watch/test_watch_registration.py -m slow

    # Single test
    docker compose exec celery_worker pytest tests/watch/test_watch_registration.py::TestWatchRegistration::test_observer_creates_dataset_with_correct_attributes
    docker compose exec celery_worker pytest tests/watch/test_watch_registration.py::test_dataset_type_is_set_correctly

    # By marker
    docker compose exec celery_worker pytest -m watch_script
    docker compose exec celery_worker pytest -m "watch_script and not requires_celery"

    # From inside the container (after: docker compose exec celery_worker bash)
    pytest tests/watch/test_watch_registration.py
    pytest tests/watch/test_watch_registration.py -x -v

Test logs:
    Persistent:  workers/test_logs/watch_tests.log  (appended across runs)
    Per-run:     workers/test_logs/test_run_YYYYMMDD_HHMMSS.log
    Both files are bind-mounted from the container: /opt/sca/app/test_logs/ -> workers/test_logs/
-------------------------------------------------------------------------------
"""

import logging
import os
import time
from pathlib import Path
from typing import Any

import pytest

import workers.api as api
import workers.utils as utils
from workers.config import config
from workers.dataset import (compute_staging_path, get_archive_bundle_name,
                             get_archive_path, get_bundle_download_path,
                             get_bundle_name, get_bundle_staged_path,
                             get_dataset_download_path, stage_alias)
from workers.services.watchlib import Observer

# Maximum seconds to wait for all workflow steps to reach SUCCESS.
_WORKFLOW_COMPLETION_TIMEOUT_SECONDS: int = 300

# How long to wait between polls when checking step progress.
_WORKFLOW_POLL_INTERVAL_SECONDS: float = 10.0

# Step statuses from which the workflow will never recover.
_TERMINAL_FAILURE_STATUSES: frozenset[str] = frozenset({'FAILED', 'FAILURE', 'REVOKED'})

# Expected dataset state sequence for the integrated workflow, in chronological
# (oldest-first) order.  Each entry maps to the task that sets it:
#   REGISTERED  — API dataset.create() at registration time
#   READY       — await_stability (dataset has stabilized on disk)
#   ARCHIVED    — archive_dataset
#   FETCHED     — stage_dataset
#   STAGED      — validate_dataset
_INTEGRATED_WF_STATE_SEQUENCE: tuple[str, ...] = (
    'REGISTERED',
    'READY',
    'ARCHIVED',
    'FETCHED',
    'STAGED',
)

logger = logging.getLogger(__name__)

_skip_watch_tests: bool = os.getenv('SKIP_WATCH_SCRIPT_TESTS', 'false').lower() == 'true'


def _state_names(dataset: dict[str, Any]) -> list[str]:
    """Return dataset state names in chronological (oldest-first) order.

    The API returns states ordered by timestamp DESC (most-recent first via
    INCLUDE_STATES in constants.js), so we reverse to get insertion order.
    """
    return [s['state'] for s in reversed(dataset.get('states') or [])]


def _log_dataset(prefix: str, dataset: dict[str, Any]) -> None:
    """Emit a structured INFO log line for a dataset — survives dataset deletion."""
    logger.info(
        f'{prefix} | '
        f'id={dataset["id"]} '
        f'name={dataset["name"]} '
        f'type={dataset.get("type")} '
        f'origin_path={dataset.get("origin_path")} '
        f'archive_path={dataset.get("archive_path")} '
        f'staged_path={dataset.get("staged_path")} '
        f'create_method={dataset.get("create_method")} '
        f'is_deleted={dataset.get("is_deleted")}'
    )


def _log_workflow(prefix: str, workflow: dict[str, Any]) -> None:
    """Emit a structured INFO log line for a workflow."""
    steps = workflow.get('steps', [])
    step_summary = ', '.join(
        f'{s["name"]}={s.get("status", "?")}' for s in steps
    )
    logger.info(
        f'{prefix} | '
        f'wf_id={workflow["id"]} '
        f'name={workflow.get("name")} '
        f'status={workflow.get("status")} '
        f'steps=[{step_summary}]'
    )


# ---------------------------------------------------------------------------
# Simple per-type test — runs for each dataset type, asserts type only
# ---------------------------------------------------------------------------

@pytest.mark.integration
@pytest.mark.watch_script
@pytest.mark.requires_celery
@pytest.mark.skipif(_skip_watch_tests, reason='SKIP_WATCH_SCRIPT_TESTS=true in environment')
def test_dataset_type_is_set_correctly(
    registered_dataset: dict[str, Any],
    dataset_type: str,
) -> None:
    """
    The dataset type stored in the API must match the type that was passed to
    Register at construction time.

    Runs once per supported dataset type (RAW_DATA, DATA_PRODUCT).
    All other assertions live in TestWatchRegistration (RAW_DATA only).
    """
    dataset: dict[str, Any] = registered_dataset['dataset']
    _log_dataset('test_dataset_type_is_set_correctly', dataset)

    assert dataset['type'] == dataset_type, (
        f'Expected type={dataset_type!r}, got {dataset["type"]!r} '
        f'for dataset id={dataset["id"]}'
    )
    logger.info(
        f'PASS type={dataset_type} for dataset id={dataset["id"]} name={dataset["name"]}'
    )


# ---------------------------------------------------------------------------
# Main test class — uses primary (RAW_DATA-only) fixtures, runs each test once
# ---------------------------------------------------------------------------

@pytest.mark.integration
@pytest.mark.watch_script
@pytest.mark.requires_celery
@pytest.mark.skipif(_skip_watch_tests, reason='SKIP_WATCH_SCRIPT_TESTS=true in environment')
class TestWatchRegistration:
    """
    Core registration and workflow tests.  Each test runs once (RAW_DATA) via
    the non-parameterized `primary_*` fixture chain.
    """

    def test_observer_creates_dataset_with_correct_attributes(
        self,
        primary_registered_dataset: dict[str, Any],
        primary_dataset_type: str,
    ) -> None:
        """
        When a new directory appears in the watched path the Observer detects it
        as an 'add' event and Register creates a dataset record with:

            - a valid id
            - origin_path equal to the actual directory path on disk
            - origin_path inside the configured source_dir for this type
            - create_method == 'SCAN'
        """
        dataset: dict[str, Any] = primary_registered_dataset['dataset']
        dataset_path: Path = primary_registered_dataset['path']

        _log_dataset('test_observer_creates_dataset_with_correct_attributes:setup', dataset)

        assert dataset['id'] is not None

        # origin_path must point to the exact directory that was registered.
        assert dataset['origin_path'] == str(dataset_path.resolve()), (
            f'id={dataset["id"]} — '
            f'Expected origin_path="{dataset_path.resolve()}", '
            f'got="{dataset["origin_path"]}"'
        )

        # origin_path must be located inside the configured source_dir for
        # this dataset type — the watch script should never register a path
        # that lives outside its designated landing area.
        expected_source_dir = Path(config['registration'][primary_dataset_type]['source_dir'])
        assert Path(dataset['origin_path']).is_relative_to(expected_source_dir), (
            f'id={dataset["id"]} — '
            f'origin_path="{dataset["origin_path"]}" is not inside '
            f'source_dir="{expected_source_dir}" (type={primary_dataset_type})'
        )

        assert dataset['create_method'] == 'SCAN', (
            f'id={dataset["id"]} — '
            f'Expected create_method="SCAN", got="{dataset["create_method"]}"'
        )

        # The API sets the initial state to REGISTERED synchronously at
        # dataset creation time — it must be present immediately.
        states = _state_names(dataset)
        assert _INTEGRATED_WF_STATE_SEQUENCE[0] in states, (
            f'id={dataset["id"]} — '
            f'Expected initial state "REGISTERED" to be present immediately after '
            f'registration, got states: {states}'
        )
        assert states[0] == _INTEGRATED_WF_STATE_SEQUENCE[0], (
            f'id={dataset["id"]} — '
            f'Expected "REGISTERED" to be the FIRST state, '
            f'got states (chronological): {states}'
        )

        logger.info(
            f'PASS id={dataset["id"]} name={dataset["name"]} '
            f'origin_path={dataset["origin_path"]} '
            f'source_dir={expected_source_dir} '
            f'create_method={dataset["create_method"]} '
            f'states={states}'
        )

    def test_observer_triggers_integrated_workflow(
        self,
        primary_registered_dataset: dict[str, Any],
        primary_dataset_type: str,
    ) -> None:
        """
        After Observer detects a new directory, exactly one 'integrated' workflow
        should be linked to the dataset in Postgres and visible via Rhythm.

        Step names are read from config — the single source of truth for the
        workflow definition.
        """
        dataset: dict[str, Any] = primary_registered_dataset['dataset']
        _log_dataset('test_observer_triggers_integrated_workflow:dataset', dataset)

        result: dict[str, Any] = api.get_workflows_for_dataset(dataset_id=dataset['id'])
        total: int = result.get('metadata', {}).get('total', 0)
        workflows: list[dict[str, Any]] = result.get('results', [])

        assert total == 1, (
            f'id={dataset["id"]} — '
            f'Expected exactly 1 workflow, found {total}. '
            f'The integrated workflow was either not kicked off or kicked off more than once.'
        )

        workflow: dict[str, Any] = workflows[0]
        _log_workflow('test_observer_triggers_integrated_workflow:workflow', workflow)

        assert workflow.get('name') == 'integrated', (
            f'id={dataset["id"]} wf_id={workflow["id"]} — '
            f'Expected workflow name "integrated", got {workflow.get("name")!r}'
        )

        expected_steps: list[dict[str, Any]] = config['workflow_registry']['integrated']['steps']
        expected_step_names: list[str] = [s['name'] for s in expected_steps]
        actual_step_names: list[str] = [s['name'] for s in workflow.get('steps', [])]

        assert actual_step_names == expected_step_names, (
            f'id={dataset["id"]} wf_id={workflow["id"]} — '
            f'Step names mismatch. '
            f'Expected={expected_step_names}, Got={actual_step_names}'
        )

        logger.info(
            f'PASS id={dataset["id"]} name={dataset["name"]} '
            f'wf_id={workflow["id"]} steps={actual_step_names}'
        )

    def test_observer_does_not_register_same_directory_twice(
        self,
        primary_registered_dataset: dict[str, Any],
        primary_dataset_type: str,
        primary_type_observer: Observer,
    ) -> None:
        """
        A second Observer.watch() cycle on the same directory must NOT register
        the dataset again — the Observer's known-state diffing (added = current
        - known) should prevent re-submission entirely.
        """
        dataset: dict[str, Any] = primary_registered_dataset['dataset']
        dataset_name: str = dataset['name']
        _log_dataset('test_observer_does_not_register_same_directory_twice:dataset', dataset)

        logger.info(
            f'Triggering second Observer.watch() for dataset id={dataset["id"]} '
            f'name={dataset_name} — expecting no re-registration'
        )
        primary_type_observer.watch()

        matches: list[dict[str, Any]] = api.get_all_datasets(
            dataset_type=primary_dataset_type,
            name=dataset_name,
            match_name_exact=True,
        )
        assert len(matches) == 1, (
            f'id={dataset["id"]} name={dataset_name} — '
            f'Expected exactly 1 record, found {len(matches)}. '
            f'Observer may have re-registered the directory.'
        )
        logger.info(
            f'PASS idempotency confirmed: id={dataset["id"]} name={dataset_name} '
            f'exists exactly once after second watch cycle'
        )

    @pytest.mark.slow
    @pytest.mark.integrated_wf
    def test_integrated_workflow_steps_all_succeed(
        self,
        primary_registered_dataset: dict[str, Any],
        primary_dataset_type: str,
    ) -> None:
        """
        All workflow steps defined in config reach SUCCESS status.

        After the workflow completes the test re-fetches the dataset and runs
        per-step assertions, verifying every piece of persistent state that each
        task writes to the database or filesystem.  All expected values are
        derived from helpers in workers/dataset.py and workers/utils.py rather
        than hardcoded, so the tests stay in sync automatically if the formulas
        ever change.

        inspect_dataset
            du_size > 0, size > 0, num_files > 0, num_directories >= 0
            num_genome_files >= 0 (in metadata)
            file records count == num_files (all files indexed)
            each file record has path, md5 (non-empty), size > 0

        archive_dataset
            archive_path == get_archive_path(dataset)
            archive file exists on disk
            bundle.name == get_archive_bundle_name(dataset)
            bundle.size > 0
            bundle.md5 == utils.checksum(archive_file)  ← end-to-end integrity

        stage_dataset
            staged_path == str(compute_staging_path(dataset)[0])
            staged directory exists on disk
            metadata.stage_alias == stage_alias(dataset)  ← deterministic alias
            staged bundle file exists at get_bundle_staged_path(dataset)
            staged bundle filename == get_bundle_name(dataset)

        validate_dataset
            is_staged == True

        setup_dataset_download
            download symlink exists at get_dataset_download_path(dataset)
            download symlink → staged_path  (correct target)
            bundle download symlink exists at get_bundle_download_path(dataset)
            bundle download symlink → bundle staged path  (correct target)
        """
        dataset: dict[str, Any] = primary_registered_dataset['dataset']
        _log_dataset('test_integrated_workflow_steps_all_succeed:registered', dataset)

        result: dict[str, Any] = api.get_workflows_for_dataset(dataset_id=dataset['id'])
        workflows: list[dict[str, Any]] = result.get('results', [])

        if not workflows:
            pytest.fail(
                f'No workflow found for dataset id={dataset["id"]} '
                f'name={dataset["name"]}. Cannot poll for step completion.'
            )

        workflow: dict[str, Any] = workflows[0]
        workflow_id: str = workflow['id']
        _log_workflow('test_integrated_workflow_steps_all_succeed:workflow_start', workflow)

        expected_steps: list[dict[str, Any]] = config['workflow_registry']['integrated']['steps']
        expected_step_names: list[str] = [s['name'] for s in expected_steps]

        last_step_statuses: dict[str, str] = {}
        elapsed: float = 0.0

        logger.info(
            f'Polling workflow wf_id={workflow_id} for dataset id={dataset["id"]} '
            f'name={dataset["name"]} — '
            f'timeout={_WORKFLOW_COMPLETION_TIMEOUT_SECONDS}s '
            f'poll_interval={_WORKFLOW_POLL_INTERVAL_SECONDS}s '
            f'expected_steps={expected_step_names}'
        )

        while elapsed < _WORKFLOW_COMPLETION_TIMEOUT_SECONDS:
            wf: dict[str, Any] = api.get_workflow(
                workflow_id=workflow_id,
                last_task_runs=True,
                prev_task_runs=True,
            )

            steps: list[dict[str, Any]] | None = wf.get('steps')
            if steps is None:
                pytest.fail(
                    f'wf_id={workflow_id} — Rhythm returned workflow without a "steps" key. '
                    f'API-to-Rhythm connection may be broken. '
                    f'Keys present: {list(wf.keys())}'
                )

            last_step_statuses = {s['name']: s['status'] for s in steps}

            failed_steps: dict[str, str] = {
                name: status
                for name, status in last_step_statuses.items()
                if status in _TERMINAL_FAILURE_STATUSES
            }
            if failed_steps:
                logger.error(
                    f'wf_id={workflow_id} dataset id={dataset["id"]} '
                    f'name={dataset["name"]} — terminal failures: {failed_steps} | '
                    f'all statuses: {last_step_statuses}'
                )
                pytest.fail(
                    f'wf_id={workflow_id} has steps in terminal failure state: {failed_steps}'
                )

            pending_steps: list[str] = [
                name for name in expected_step_names
                if last_step_statuses.get(name) != 'SUCCESS'
            ]
            done_count: int = len(expected_step_names) - len(pending_steps)

            if not pending_steps:
                logger.info(
                    f'wf_id={workflow_id} dataset id={dataset["id"]} '
                    f'name={dataset["name"]} — '
                    f'ALL {len(expected_step_names)} steps SUCCEEDED '
                    f'(elapsed={elapsed:.0f}s) | '
                    f'statuses: {last_step_statuses}'
                )
                break

            logger.debug(
                f'wf_id={workflow_id} — {done_count}/{len(expected_step_names)} steps done '
                f'(elapsed={elapsed:.0f}s) | statuses: {last_step_statuses} | '
                f'still pending: {pending_steps}'
            )
            time.sleep(_WORKFLOW_POLL_INTERVAL_SECONDS)
            elapsed += _WORKFLOW_POLL_INTERVAL_SECONDS
        else:
            logger.error(
                f'wf_id={workflow_id} dataset id={dataset["id"]} '
                f'name={dataset["name"]} — TIMEOUT after {elapsed:.0f}s | '
                f'final statuses: {last_step_statuses}'
            )
            pytest.fail(
                f'wf_id={workflow_id} did not complete within '
                f'{_WORKFLOW_COMPLETION_TIMEOUT_SECONDS}s for dataset '
                f'id={dataset["id"]} name={dataset["name"]}. '
                f'Final step statuses: {last_step_statuses}'
            )

        # -----------------------------------------------------------------
        # Post-workflow assertions — one block per workflow step
        # All expected values derived from workers/dataset.py helpers.
        # -----------------------------------------------------------------
        _id = dataset['id']
        _name = dataset['name']

        # Fetch with bundle=True (bundle metadata) and files=True (file records).
        fresh: dict[str, Any] = api.get_dataset(
            dataset_id=_id,
            bundle=True,
            files=True,
        )
        _log_dataset('test_integrated_workflow_steps_all_succeed:post_workflow', fresh)

        # ── inspect_dataset ───────────────────────────────────────────────
        assert (fresh.get('du_size') or 0) > 0, (
            f'id={_id} — du_size should be > 0 after inspect, got {fresh.get("du_size")}'
        )
        assert (fresh.get('size') or 0) > 0, (
            f'id={_id} — size should be > 0 after inspect, got {fresh.get("size")}'
        )
        assert (fresh.get('num_files') or 0) > 0, (
            f'id={_id} — num_files should be > 0 after inspect, got {fresh.get("num_files")}'
        )
        assert (fresh.get('num_directories') or 0) >= 0, (
            f'id={_id} — num_directories should be >= 0 after inspect'
        )
        num_genome_files = (fresh.get('metadata') or {}).get('num_genome_files', -1)
        assert num_genome_files >= 0, (
            f'id={_id} — metadata.num_genome_files missing or negative after inspect, '
            f'got {num_genome_files}'
        )

        file_records: list[dict[str, Any]] = fresh.get('files') or []
        assert len(file_records) == fresh['num_files'], (
            f'id={_id} — file record count ({len(file_records)}) != '
            f'num_files ({fresh["num_files"]}) — some files were not indexed'
        )
        for rec in file_records:
            assert rec.get('path'), f'id={_id} — file record missing path: {rec}'
            assert rec.get('md5'), f'id={_id} — file record missing md5: {rec}'
            assert (rec.get('size') or 0) >= 0, f'id={_id} — file record negative size: {rec}'

        logger.info(
            f'inspect: id={_id} du_size={fresh["du_size"]} size={fresh["size"]} '
            f'num_files={fresh["num_files"]} num_directories={fresh["num_directories"]} '
            f'num_genome_files={num_genome_files} file_records={len(file_records)}'
        )

        # ── archive_dataset ───────────────────────────────────────────────
        expected_archive = get_archive_path(fresh)
        assert fresh.get('archive_path') == expected_archive, (
            f'id={_id} — archive_path mismatch: '
            f'expected="{expected_archive}", got="{fresh.get("archive_path")}"'
        )
        archive_file = Path(expected_archive)
        assert archive_file.exists(), (
            f'id={_id} — archive file missing on disk: {expected_archive}'
        )

        bundle: dict[str, Any] = fresh.get('bundle') or {}
        assert bundle, f'id={_id} — bundle metadata is empty/None after archive_dataset'

        expected_archive_bundle_name = get_archive_bundle_name(fresh)
        assert bundle.get('name') == expected_archive_bundle_name, (
            f'id={_id} — bundle.name mismatch: '
            f'expected="{expected_archive_bundle_name}", got="{bundle.get("name")}"'
        )
        assert int(bundle.get('size') or 0) > 0, (
            f'id={_id} — bundle.size should be > 0, got {bundle.get("size")}'
        )
        stored_md5: str = bundle.get('md5') or ''
        assert len(stored_md5) == 32 and all(c in '0123456789abcdef' for c in stored_md5), (
            f'id={_id} — bundle.md5 is not a valid hex MD5: {stored_md5!r}'
        )
        actual_md5 = utils.checksum(archive_file)
        assert actual_md5 == stored_md5, (
            f'id={_id} — archive bundle checksum mismatch: '
            f'file on disk={actual_md5}, stored in DB={stored_md5}'
        )

        logger.info(
            f'archive: id={_id} archive_path={expected_archive} '
            f'bundle.name={bundle.get("name")} bundle.size={bundle.get("size")} '
            f'bundle.md5={stored_md5}'
        )

        # ── stage_dataset ─────────────────────────────────────────────────
        expected_staged_path, _alias = compute_staging_path(fresh)
        assert fresh.get('staged_path') == str(expected_staged_path), (
            f'id={_id} — staged_path mismatch: '
            f'expected="{expected_staged_path}", got="{fresh.get("staged_path")}"'
        )
        assert expected_staged_path.exists(), (
            f'id={_id} — staged directory missing on disk: {expected_staged_path}'
        )

        # stage_alias is deterministic: verify stored value matches computed value.
        stored_alias: str = (fresh.get('metadata') or {}).get('stage_alias', '')
        expected_alias: str = stage_alias(fresh)
        assert stored_alias == expected_alias, (
            f'id={_id} — metadata.stage_alias mismatch: '
            f'expected="{expected_alias}", stored="{stored_alias}"'
        )

        bundle_staged = Path(get_bundle_staged_path(fresh))
        assert bundle_staged.exists(), (
            f'id={_id} — staged bundle file missing: {bundle_staged}'
        )
        assert bundle_staged.name == get_bundle_name(fresh), (
            f'id={_id} — staged bundle filename mismatch: '
            f'expected="{get_bundle_name(fresh)}", got="{bundle_staged.name}"'
        )

        logger.info(
            f'stage: id={_id} staged_path={expected_staged_path} '
            f'stage_alias={stored_alias} bundle_staged={bundle_staged}'
        )

        # ── validate_dataset ──────────────────────────────────────────────
        assert fresh.get('is_staged') is True, (
            f'id={_id} — is_staged should be True after validate_dataset, '
            f'got {fresh.get("is_staged")!r}'
        )
        logger.info(f'validate: id={_id} is_staged={fresh.get("is_staged")}')

        # ── setup_dataset_download ────────────────────────────────────────
        dataset_dl_path = get_dataset_download_path(fresh)
        assert dataset_dl_path.is_symlink(), (
            f'id={_id} — dataset download symlink missing: {dataset_dl_path}'
        )
        assert dataset_dl_path.resolve() == expected_staged_path.resolve(), (
            f'id={_id} — dataset download symlink target mismatch: '
            f'expected → {expected_staged_path}, got → {dataset_dl_path.resolve()}'
        )

        bundle_dl_path = get_bundle_download_path(fresh)
        assert bundle_dl_path.is_symlink(), (
            f'id={_id} — bundle download symlink missing: {bundle_dl_path}'
        )
        assert bundle_dl_path.resolve() == bundle_staged.resolve(), (
            f'id={_id} — bundle download symlink target mismatch: '
            f'expected → {bundle_staged}, got → {bundle_dl_path.resolve()}'
        )

        logger.info(
            f'setup_download: id={_id} '
            f'dataset_dl={dataset_dl_path} → {dataset_dl_path.resolve()} | '
            f'bundle_dl={bundle_dl_path} → {bundle_dl_path.resolve()}'
        )

        # ── state progression ─────────────────────────────────────────────
        # Re-fetch to get the full states list (states are included by default
        # in get_dataset; the `fresh` above was fetched with files=True/bundle=True
        # which may not guarantee latest states after concurrent writes).
        final: dict[str, Any] = api.get_dataset(dataset_id=_id)
        actual_states = _state_names(final)

        # Every expected state must be present.
        missing = [s for s in _INTEGRATED_WF_STATE_SEQUENCE if s not in actual_states]
        assert not missing, (
            f'id={_id} — Missing states after integrated workflow: {missing}. '
            f'Full state history (chronological): {actual_states}'
        )

        # The relative order of the expected states must match the defined sequence.
        # Filter to only the states we care about (there could be extras in future).
        ordered = [s for s in actual_states if s in _INTEGRATED_WF_STATE_SEQUENCE]
        assert ordered == list(_INTEGRATED_WF_STATE_SEQUENCE), (
            f'id={_id} — State progression order mismatch. '
            f'Expected (chronological): {list(_INTEGRATED_WF_STATE_SEQUENCE)}. '
            f'Got (filtered to expected states): {ordered}. '
            f'Full history: {actual_states}'
        )

        logger.info(
            f'states: id={_id} chronological={actual_states} '
            f'(matches expected sequence {list(_INTEGRATED_WF_STATE_SEQUENCE)})'
        )

        logger.info(
            f'PASS all post-workflow assertions for id={_id} name={_name} '
            f'wf_id={workflow_id}'
        )

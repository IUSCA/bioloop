**Description**

This PR stabilizes the Docker development environment and introduces
end-to-end integration tests for the watch-script based dataset-registration pipeline.

Two categories of changes:

1. **Docker startup fixes** — a set of targeted fixes that make the Docker stack reliable and repeatable to bring up from a clean checkout. These address inter-service connectivity failures, stale credentials, unnecessary re-work on warm restarts, and missing runtime dependencies.

2. **`watch.py` integration tests** — a full integration test suite for the `watch.py` observer/registration pipeline, running inside the `celery_worker` container against the live Docker stack (API, Postgres, Celery, Rhythm).

---

**Related Issue(s)**

N/A

---

**Changes Made**

- [ ] Feature added
- [x] Bug fixed
- [x] Code refactored
- [x] Tests changed
- [x] Documentation updated
- [x] Other changes:

#### Docker / Infra

- [x] `docker-compose.yml` — corrected `rhythm` service volume mount to a named volume (`rhythm_keys`) so RSA keys and `WORKFLOW_AUTH_TOKEN` survive container restarts; added named volumes for `node_modules` in `api`, `ui`, and `secure_download` to cache npm installs across restarts; reduced health-check `interval` and added `start_period` on all relevant services (API uses 180s start_period for cold start); main Postgres published on host port 5433 to avoid port conflict
- [x] `rhythm/bin/entrypoint.sh` — replaced `sed -i` (broken on macOS virtiofs bind mounts) with `grep -v | cat` for env-file writes; coupled key and token regeneration via a `KEYS_GENERATED` flag so a stale token is never paired with fresh keys
- [x] `api/bin/entrypoint.sh` — same `sed -i` → `grep -v | cat` fix for OAuth credential injection; added lockfile-hash + `node_modules/.bin` existence checks to skip `npm install` on warm restarts; added schema-hash check to skip `prisma generate`; added a `.db_seeded` marker to skip `prisma db seed` after first run
- [x] `ui/bin/entrypoint.sh` — switched TLS cert generation from `rsa:4096` to `rsa:2048` for faster first-run; added same npm install caching as API
- [x] `secure_download/bin/entrypoint.sh` — added npm install caching
- [x] `workers/bin/entrypoint.sh` — added `rm -f celery_worker.pid` to prevent Celery from refusing to start when a stale PID file is left behind on a bind-mounted volume
- [x] `workers/Dockerfile` — changed `poetry install --no-dev` → `poetry install` so dev dependencies (pytest, etc.) are available inside the container
- [x] `workers/workers/config/common.py` — `load_dotenv(override=True)` so `.env` values take precedence over `.env.default` values pre-loaded by Docker Compose `env_file`
- [x] `workers/workers/config/docker.py` — added `wait_between_stability_checks_seconds: 5` (was missing, caused `await_stability` to sleep 300 s); added `rejects` lists for both dataset types to prevent the production `watch` service from auto-registering test isolation directories; set `recency_threshold_seconds: 5` for faster Docker dev iteration
- [x] `bin/reset_docker.sh` — resets the Docker environment to a clean-checkout state (clears `.env` files, removes volumes, wipes bind-mounted DB data); supports `--reset-all` / `-a` to skip all prompts; uses `docker run alpine` for root-owned bind-mount cleanup where needed

#### Worker runtime fixes

- [x] `workers/workers/tasks/inspect.py` — raise `InspectionFailed` immediately if the dataset is already soft-deleted or if `origin_path` no longer exists on disk, preventing spurious `du -sb` errors and unnecessary Celery retries
- [x] `workers/workers/tasks/delete.py` — Docker-mode guard: delete the local archive file directly instead of calling `sda.delete()` (which shells out to `hsi`, not available in Docker)
- [x] `workers/workers/tasks/archive.py` — use `get_archive_bundle_name()` helper for the bundle filename instead of hardcoded `.tar` literal
- [x] `workers/workers/tasks/download.py` — use `get_dataset_download_path()` and `get_bundle_download_path()` helpers for symlink targets; removes inline path construction and `glom` import
- [x] `workers/workers/workflow_utils.py` — `get_archive_dir()` gains a `create: bool = True` parameter so callers can retrieve the path value without creating the directory as a side effect
- [x] `workers/workers/dataset.py` — added `_BUNDLE_EXTENSION` constant; new helpers `get_archive_path()`, `get_archive_bundle_name()`, `get_dataset_download_path()`, `get_bundle_download_path()`; updated all existing helpers and docstrings to use "bundle" terminology consistently
- [x] `workers/workers/scripts/watch.py` — `Register` accepts `wf_start_kwargs` to forward extra kwargs to `wf.start()`; `create_method: 'SCAN'` is now set on the dataset payload at registration time
- [x] `workers/workers/api.py` — `get_dataset()` gains `include_audit_logs` parameter and flattens `create_method` from the audit log onto the dataset dict; added `get_workflows_for_dataset()` and `get_workflow()` helpers

#### Integration tests (`workers/tests/watch/`)

- [x] `workers/pytest.ini` — pytest configuration: test discovery, markers, log persistence (container `/tmp/bioloop_test_logs/`), 10-minute per-test timeout
- [x] `workers/tests/conftest.py` — shared hooks: `pytest_sessionstart` (per-run log file), `pytest_runtest_setup/teardown`, `pytest_runtest_logreport` (PASSED / FAILED / ERROR per phase)
- [x] `workers/tests/watch/conftest.py` — fixtures for `watch.py` integration tests; two fixture chains (parameterized over both dataset types; single-type RAW_DATA for type-independent tests); per-test isolation directories (`_testObservedPath_<uuid>`); session-scoped autouse purge of all test-generated datasets before and after the session; fixture teardown clears `archive_path` before soft-deleting to avoid triggering the async SDA delete workflow; no silent exception swallowing in teardown
- [x] `workers/tests/watch/test_watch_registration.py` — integration tests:
  - `test_dataset_type_is_set_correctly` — parameterized, confirms the stored type matches for each supported dataset type
  - `test_observer_creates_dataset_with_correct_attributes` — `origin_path`, `create_method == 'SCAN'`, initial `REGISTERED` state
  - `test_observer_triggers_integrated_workflow` — exactly one `integrated` workflow linked; step names match config
  - `test_observer_does_not_register_same_directory_twice` — idempotency of the Observer diffing logic
  - `test_integrated_workflow_steps_all_succeed` (slow) — polls until all steps reach `SUCCESS`; post-workflow assertions for every step: `inspect_dataset` (file counts, checksums, file records), `archive_dataset` (archive path, bundle metadata, end-to-end MD5), `stage_dataset` (staged path, stage alias, staged bundle), `validate_dataset` (`is_staged`), `setup_dataset_download` (symlink targets); asserts the full chronological state progression (`REGISTERED → READY → ARCHIVED → FETCHED → STAGED`)

#### Developer tooling

- [x] `cspell.json` — added technical vocabulary; excluded generated/non-source paths from spell-checking
- [x] Test logs and fixtures — written only in container (`/tmp/bioloop_test_logs/`, `/tmp/bioloop_watch_test_fixtures/`); no host paths or gitignore entries needed

---

**Screenshots**

N/A

---

**Checklist**

- [x] Code passes linting and coding style checks
- [x] Code reviewed and merge conflicts resolved
- [x] Review requested from at least one team member
- [x] No related issues to link
- [x] Documentation has been updated (`pytest.ini`, inline docstrings, `bin/reset_docker.sh` usage)

---

**Additional Information**

---

### What makes the Docker environment work

The changes below are prerequisites for a healthy stack.  Nothing else in this
PR depends on the test work — these fixes stand alone and should be ported to
any other Bioloop repo that runs in Docker.

| Area | File(s) | What was broken / what was fixed |
|---|---|---|
| Rhythm ↔ API auth | `docker-compose.yml`, `rhythm/bin/entrypoint.sh` | `rhythm` volume was a bind mount that lost keys on restart; moved to a named volume. `WORKFLOW_AUTH_TOKEN` was regenerated independently of the keys, so the API held a token signed by old keys. Coupled them via a `KEYS_GENERATED` flag. |
| env-file writes | `rhythm/bin/entrypoint.sh`, `api/bin/entrypoint.sh` | `sed -i` fails silently on some bind mount implementations; replaced with `grep -v \| cat` throughout. |
| Celery PID file | `workers/bin/entrypoint.sh` | Container restart left a stale `celery_worker.pid` on the bind-mounted volume; Celery refused to start. Added `rm -f celery_worker.pid` before startup. |
| npm install cache | `api/bin/entrypoint.sh`, `ui/bin/entrypoint.sh`, `secure_download/bin/entrypoint.sh`, `docker-compose.yml` | `node_modules` was re-installed on every restart (~30 s each). Added lockfile-hash + `.bin` existence checks and named volumes to persist `node_modules`. |
| Prisma generate cache | `api/bin/entrypoint.sh` | `prisma generate` ran on every restart (~10 s). Added schema-hash check to skip when unchanged. |
| DB seed idempotency | `api/bin/entrypoint.sh` | `prisma db seed` has no built-in skip mechanism; it ran on every restart. Added `.db_seeded` marker (wiped by `reset_docker.sh` alongside DB data). |
| Worker dev deps | `workers/Dockerfile` | `poetry install --no-dev` excluded pytest; changed to `poetry install`. |
| `load_dotenv` order | `workers/workers/config/common.py` | `load_dotenv()` without `override=True` let Docker Compose `env_file` defaults silently win over `.env` values. |
| Docker stability check | `workers/workers/config/docker.py` | `wait_between_stability_checks_seconds` was missing; `await_stability` slept 300 s between polls in Docker mode. |
| Docker archive delete | `workers/workers/tasks/delete.py` | `delete_dataset` always called `hsi` (remote archive CLI), which is not present in Docker. Added an env guard to delete the local file directly. |
| Inspect task safety | `workers/workers/tasks/inspect.py` | `inspect_dataset` called `du -sb` on `origin_path` without checking existence first, crashing with a non-zero exit when the path was gone. Added early `is_deleted` and `source.exists()` guards. |

**Resetting the Docker environment to a clean state:**

```bash
./bin/reset_docker.sh --reset-all
# or: ./bin/reset_docker.sh -a
```

---

### What makes the integration tests work

The test work builds on top of the Docker fixes above and adds a full
integration test suite for the `watch.py` observer/registration pipeline.

| Area | File(s) | Purpose |
|---|---|---|
| pytest config | `workers/pytest.ini` | Test discovery, markers, log persistence (container `/tmp/bioloop_test_logs/`), 10-min timeout. |
| Shared hooks | `workers/tests/conftest.py` | Per-run timestamped log file, per-test setup/teardown banners, PASSED/FAILED/ERROR outcome logging. |
| Test fixtures | `workers/tests/watch/conftest.py` | Two fixture chains (parameterized over both dataset types; single-type for type-independent tests). Per-test isolation directories. Session-wide autouse purge of all test-generated datasets. |
| Test cases | `workers/tests/watch/test_watch_registration.py` | Observer detection, dataset attribute assertions, workflow kickoff, idempotency, and a slow end-to-end test that polls until all workflow steps succeed and asserts every piece of persistent state written by each step. |
| Dataset path helpers | `workers/workers/dataset.py` | Added `get_archive_path`, `get_archive_bundle_name`, `get_dataset_download_path`, `get_bundle_download_path` so tests derive expected values from the same formulas production code uses. |
| `wf_start_kwargs` | `workers/workers/scripts/watch.py` | `Register` now accepts `wf_start_kwargs` so tests can pass `recency_threshold` directly to `wf.start()` for faster stability checks. |
| Audit log flattening | `workers/workers/api.py` | `get_dataset(include_audit_logs=True)` flattens `create_method` from the audit log onto the dataset dict; added `get_workflows_for_dataset()` and `get_workflow()` helpers used by the tests. |
| Test isolation | `workers/workers/config/docker.py` | Added `_testObservedPath_*` to `rejects` so the production `watch` service does not auto-register test isolation directories as real datasets. |

**Running the tests** (Docker stack must be up and healthy):

```bash
docker compose exec celery_worker pytest tests/watch/test_watch_registration.py
# skip the slow workflow-completion test
docker compose exec celery_worker pytest tests/watch/test_watch_registration.py -m "not slow"
```

Logs are written to `/tmp/bioloop_test_logs/` inside the container (e.g. `docker compose exec celery_worker tail -f /tmp/bioloop_test_logs/watch_tests.log`).

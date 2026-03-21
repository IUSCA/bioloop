# Watch Integration Tests

Tests for the `watch.py` Observer → Register → API → Rhythm chain.

**File:** `workers/tests/watch/test_watch_registration.py`  
**Fixtures:** `workers/tests/watch/conftest.py`  
**pytest config:** `workers/pytest.ini`

---

## Prerequisites

The full Docker stack must be running and healthy, including:
- `api` (healthy)
- `postgres`
- `celery_worker` (running — workflow tasks are queued here)
- `rhythm` (healthy)
- `mongo` + `queue`

```bash
docker compose up -d
docker compose ps   # confirm api, rhythm, signet_db, signet are healthy
```

---

## Running the tests

All commands use `docker compose exec celery_worker` to run pytest inside the
worker container, which has the Python environment, Docker network access, and
the correct `APP_ENV=docker` config.

### Run all watch tests

```bash
docker compose exec celery_worker pytest tests/watch/
```

### Run the full registration + workflow suite

```bash
docker compose exec celery_worker pytest tests/watch/test_watch_registration.py
```

### Run a single test class

```bash
docker compose exec celery_worker pytest tests/watch/test_watch_registration.py::TestWatchRegistration
```

### Run a single test method (both dataset type variants)

```bash
docker compose exec celery_worker pytest tests/watch/test_watch_registration.py::TestWatchRegistration::test_observer_detects_new_directory_and_creates_dataset
docker compose exec celery_worker pytest tests/watch/test_watch_registration.py::TestWatchRegistration::test_integrated_workflow_steps_all_succeed
```

### Run for one dataset type only

Append `[RAW_DATA]` or `[DATA_PRODUCT]` to the node id:

```bash
docker compose exec celery_worker pytest "tests/watch/test_watch_registration.py::TestWatchRegistration::test_integrated_workflow_steps_all_succeed[RAW_DATA]"
```

Or use `-k` to filter by keyword:

```bash
docker compose exec celery_worker pytest tests/watch/ -k "RAW_DATA"
docker compose exec celery_worker pytest tests/watch/ -k "DATA_PRODUCT"
```

### Run by marker

Markers are defined in `pytest.ini`.

```bash
# All watch-script tests
docker compose exec celery_worker pytest -m watch_script

# Only tests that don't require Celery (registration checks, no workflow polling)
docker compose exec celery_worker pytest -m "watch_script and not requires_celery"

# Only the slow workflow-completion tests
docker compose exec celery_worker pytest -m "watch_script and requires_celery"
```

### Verbose output / long tracebacks

```bash
docker compose exec celery_worker pytest tests/watch/ -v --tb=long
```

### Stop after first failure

```bash
docker compose exec celery_worker pytest tests/watch/ -x
```

### From inside the container (after `docker compose exec celery_worker bash`)

```bash
pytest tests/watch/
pytest tests/watch/ -k RAW_DATA -x
```

---

## Skipping the tests

Set `SKIP_WATCH_SCRIPT_TESTS=true` in `workers/.env` to skip the entire suite.
Useful on forks that have customised registration or workflow logic.

```bash
echo "SKIP_WATCH_SCRIPT_TESTS=true" >> workers/.env
```

---

## Test logs

`pytest.ini` configures persistent log output:

| Log | Path on host | Notes |
|---|---|---|
| Live CLI output | stdout | `log_cli = true`, level INFO |
| Persistent file | `workers/test_logs/watch_tests.log` | Level DEBUG, appended across runs |

To follow the log while tests run:

```bash
tail -f workers/test_logs/watch_tests.log
```

To start fresh (truncate log before a run):

```bash
> workers/test_logs/watch_tests.log
docker compose exec celery_worker pytest tests/watch/
```

---

## Test class and method reference

All tests live in `TestWatchRegistration` and run twice — once for `RAW_DATA`
and once for `DATA_PRODUCT` — via the parameterized `dataset_type` fixture.

| Test method | Markers | What it asserts |
|---|---|---|
| `test_observer_detects_new_directory_and_creates_dataset` | `integration`, `watch_script` | Dataset created with correct `type`, `origin_path`, `create_method == 'SCAN'` |
| `test_observer_detects_new_directory_and_triggers_integrated_workflow` | `integration`, `watch_script`, `requires_celery` | Workflow record created in Rhythm and linked to dataset |
| `test_integrated_workflow_steps_all_succeed` | `integration`, `watch_script`, `requires_celery`, `slow` | All workflow steps reach `SUCCESS` within 300s |
| `test_observer_does_not_register_same_directory_twice` | `integration`, `watch_script` | A second `Observer.watch()` cycle on the same directory produces no duplicate dataset |

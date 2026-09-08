# register_ondemand test cases

Nine standalone scripts that exercise
[`workers/scripts/register_ondemand.py`](../../workers/scripts/register_ondemand.py)
across combinations of dataset type, absolute and relative paths, and the
`ingest_subdirs` flag.

**These are not pytest tests.** Each file defines `run_test()` rather than `test_*()`,
and each creates and deletes directories when the module is imported. `pytest.ini`
excludes this directory from collection with `norecursedirs`, because collecting a file
here would run those side effects and then report no tests.

Run one directly, from the `workers/` directory:

```bash
poetry run python -m tests.register_ondemand.test_case_1
```

Each case needs a reachable API, so `bin/devserver.sh up api` and a `workers/.env`
holding a valid `APP_API_TOKEN`. They do not need a celery worker: `register_ondemand.py`
registers datasets through the API and does not start a workflow.

Scratch directories and logs go under the configured data root — `./data/tests/register_ondemand`
in a native dev environment, `/opt/sca/data/tests/register_ondemand` in the container.
The paths come from `setup/__init__.py`; nothing here hardcodes an absolute path.

Each case leaves its datasets in the database. There is no shared cleanup, so remove
them yourself if a run matters to what you look at next.

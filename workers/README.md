# BioLoop workers

This package runs BioLoop's Celery tasks, dataset watchers, upload workflow
management, and archive/stage operations. It requires Python 3.10 and the
dependencies recorded in `poetry.lock`.

## Package validation

Run from this directory with Poetry 1.8.2:

```sh
poetry check --lock
poetry install --no-root --only main
```

The upload-integrity tests also require pytest and pytest-timeout. CI installs
those test tools separately and runs:

```sh
poetry run python -m pytest tests/upload/test_verify_upload_integrity.py
```

## Runtime configuration

Workers need the BioLoop API, RabbitMQ, MongoDB, Rhythm, and shared data paths.
Configuration is selected through `APP_ENV` and settings under `workers/config/`.
The `docker` environment uses the existing local archive/stage behavior. Preview
startup additionally enables `BIOLOOP_PREVIEW_MODE=1` for tiny synthetic files and
shorter stability waits.

The repository's `docker-compose-preview.yml` and `tools/preview/start.sh` build
and configure the preview worker, watcher, and upload poller together. Use those
definitions for an isolated preview rather than copying institutional credentials
or production settings into a local worker process.

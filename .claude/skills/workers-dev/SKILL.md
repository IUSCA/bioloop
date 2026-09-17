---
name: workers-dev
description: How to start, stop, restart, and read the logs of the Python workers natively (no docker) with pm2, what the workers need before they will start, and the storage abstraction that lets the archive step run on a machine with no tape system. Use whenever a task involves celery, the watch script, dataset registration, the upload post-processing cron, or anything under workers/.
---

# Running the workers locally

The workers are three Python processes managed by pm2. `bin/devserver.sh` manages the API,
the UI, and the Node notification worker, not these. See
[.claude/skills/dev-servers](../dev-servers/SKILL.md) for that half. Its `notifications-worker`
is the email worker, not a celery worker.

- Setup steps for a person: [docs/guides/workers-local.md](../../../docs/guides/workers-local.md)
- Reasoning, config reference, storage backends, and the chain check:
  [docs/contributing/techniques/workers-dev.md](../../../docs/contributing/techniques/workers-dev.md)

## Commands

Always from `workers/`, because the ecosystem file uses relative paths:

```
cd workers
pm2 start ecosystem.dev.config.js     # start all three
pm2 restart celery_worker             # restart one, KEEPS ITS OLD ARGS
pm2 delete watch && pm2 start ecosystem.dev.config.js --only watch   # pick up new args
pm2 stop all                          # stop, keep in the list
pm2 delete ecosystem.dev.config.js    # remove from pm2 entirely
pm2 list                              # status
pm2 logs watch                        # follow one, Ctrl-C leaves it running
```

The dev list runs `celery_worker`, `watch` (`watch_v2`), and `manage_upload_workflows`. Never
use `ecosystem.config.js` here; it is the deployed list.

**Read the `.err` log.** Logs land in `logs/workers/<name>.log` and `.err`. Celery writes almost
everything to stderr, so `celery_worker.log` holds only the banner.

**Restarting is usually unnecessary.** `worker_max_tasks_per_child = 1` in
`workers/workers/config/celeryconfig.py` runs every task in a fresh child. A task body edit
applies to the next task. Restart only after changing `tasks/declarations.py`, anything under
`workers/workers/config/`, or `celery_app.py`.

## What must be running first

| Service | Checked with |
|---|---|
| Postgres (`bioloop-postgres-1`) | `docker ps` |
| API | `curl localhost:3030/health` |
| RabbitMQ, port 5672 | `nc -z localhost 5672` |
| MongoDB, port 27017 | `nc -z localhost 27017` |
| rhythm API, port 5001 | `curl localhost:5001/health` |

RabbitMQ, MongoDB, and rhythm are started outside this repository.

**`WORKFLOW_SERVER_BASE_URL` in `api/.env` must name port 5001.** With the wrong port every
workflow fails, and the symptom is a dataset stuck in `REGISTERED`, not a connection error.

## workers/.env

Copy `workers/.env.dev.example` to `workers/.env`.

- **`APP_ENV=dev` is required.** Empty is not a default. `common.py` ships placeholder paths,
  and the watch script polls them forever.
- **A missing `API_BASE_URL` or `QUEUE_URL`** fails at import with a bare `KeyError` before
  logging starts. pm2 shows three restarts. Check `workers/.env` first.
- **The vhost is inside `QUEUE_URL`** (`localhost:5672/myvhost`). A wrong vhost shows as celery
  retrying the broker forever in `celery_worker.err`.
- **`APP_API_TOKEN`** comes from `cd api && node src/scripts/issue_token.js svc_tasks`.

**Decode the token before guessing at a worker 500.** Every `/v2` route needs
`profile.subject_id`, and `profile.id` must match the current `svc_tasks` row:

```
python3 -c "import base64,json,sys;p=sys.argv[1].split('.')[1];p+='='*(-len(p)%4);print(json.loads(base64.urlsafe_b64decode(p)))" "$APP_API_TOKEN"
```

- A token with no `subject_id` gives a worker `500 Server Error`. The API log names
  `User identifier is required to evaluate policy`.
- **A stale token can answer 200.** `POST /v2/datasets/bulk` returns every dataset in `errored`
  and an empty `created`. The cause is only in the API log, as a `grant_granted_by_fkey`
  violation. Read the API log, not the worker's output.

## The API has to agree about the directories

`UPLOAD_API_DIR`, `UPLOAD_HOST_DIR`, and `IMPORT_SOURCES_DIR` in `api/.env` must be absolute
paths under `<repo>/data`. **A relative path looks like it works and does not**: it resolves
against each process's own working directory, so the worker cannot find what the API wrote.

After editing `api/.env`, run `bin/devserver.sh restart api`. nodemon does not reload
environment variables.

## The watch script

```
python -m workers.scripts.watch_v2                    # every configured directory
python -m workers.scripts.watch_v2 --only raw_data    # one, repeatable
python -m workers.scripts.watch_v2 --dry-run          # log the payloads, create nothing
```

Directories are entries under `registration.ingestion` in `workers/workers/config/<env>.py`.
`source_dir`, `dataset_type`, and `owner_group_id` are required. Unknown keys become dataset
metadata. `--dry-run` is the fastest check of a new entry.

**Run `watch_v2.py` or `watch.py`, never both.** They race to register the same subdirectory.

**Put a new default in the one place that owns it** (`DEFAULT_WORKFLOW`, the shared
`registration` settings, `RegisterV2`, or `Observer`), never at the call site.

## The archive tier

`workers/workers/storage/` has an `sda` backend (`hsi`) and a `posix` backend, chosen by
`config['storage']['backend']`. **Never branch on `APP_ENV` for storage behaviour.** Add a
backend or a config value.

`cmd.total_size` replaces `du -sb` and `cmd.tar_supports_sparse()` guards `tar --sparse`, both
for macOS. Do not reintroduce either GNU form. `fastqc`, `multiqc`, and `sendmail` are absent,
and the tasks using them are expected to error.

## Tests

```
cd workers
poetry install --with dev                       # pytest is in the dev group
poetry run pytest tests/upload                  # unit tests, need nothing running
poetry run pytest tests/watch -m "not slow"     # integration, ~1s
poetry run pytest tests/watch -m slow           # full integrated workflow, ~20s
```

- `tests/watch` needs the pm2 `celery_worker` running. **Never start a second worker on the same
  queue**, because two workers split the tasks at random.
- **Keep `_testObservedPath_*` in the `rejects` of `dev.py` and `docker.py`.** It is the only
  thing that stops `watch` registering test directories as real datasets.
- `tests/register_ondemand` holds scripts, not pytest tests.

## Traps

**`pm2 restart` does not re-read the ecosystem file.** It replays the stored script and args,
and `--update-env` refreshes only environment variables. A changed module in
`ecosystem.dev.config.js` keeps running the old one. Check with
`pm2 describe watch | grep "script args"`, then delete and start.

**`poetry run pytest` can run the wrong pytest.** A plain `poetry install` skips the dev group.
`poetry run` then falls through to the pytest on PATH, which cannot import the venv. The
symptom is a dozen collection errors saying `No module named 'glom'`. Run
`poetry install --with dev`, or install `pytest`, `pytest-timeout`, and `pytest-asyncio`.

**Do not add `--pidfile` to the dev celery args.** pm2 does not clear a stale pid file, so a
crashed worker would refuse every restart.

**A task that spawns Python must use `sys.executable`, never `'python'`.** Under pm2 a bare
`python` resolves from PATH, not `workers/.venv/bin/python`. The subprocess then dies on
`No module named 'glom'`, and `cmd.execute_with_log_tracking` reports only a return code.

**Do not reach for a subprocess to get logs into the UI.** `log_tracking.track_task_logs` posts
in-process log lines to the same endpoint and keeps the exception type.

**`app_id` must match on both sides of the queue.** The queue is `<app_id>.q`, set in
`api/config/default.json` and `workers/workers/config/common.py`. A mismatch publishes to a
queue nobody consumes, with no error.

## Keeping this current

Amend this file whenever you hit something it does not mention: another missing command
line tool, another environment variable that fails at import, another process worth adding
to the dev list. Record dead ends explicitly, and verify a claim against the running
processes before writing it down. Put background and reference detail in
[docs/contributing/techniques/workers-dev.md](../../../docs/contributing/techniques/workers-dev.md),
and keep this file to what is needed immediately.

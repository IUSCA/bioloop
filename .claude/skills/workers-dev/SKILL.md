---
name: workers-dev
description: How to start, stop, restart, and read the logs of the Python workers natively (no docker) with pm2, what the workers need before they will start, and the storage abstraction that lets the archive step run on a machine with no tape system. Use whenever a task involves celery, the watch script, dataset registration, the upload post-processing cron, or anything under workers/.
---

# Running the workers locally

The workers are three Python processes managed by pm2. `bin/devserver.sh` manages the API,
the UI, and the Node notification worker; it does not manage these. See
[.claude/skills/dev-servers](../dev-servers/SKILL.md) for that half. Its `notifications-worker` service is
the notification email worker, not one of the celery workers on this page.

The user-facing version of this page is
[docs/guides/workers-local.md](../../../docs/guides/workers-local.md).

## Commands

Always from the `workers/` directory, because the ecosystem file uses relative paths:

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

Logs also land in `logs/workers/<name>.log` and `.err`, both gitignored. **Celery writes
almost everything to stderr**, so `celery_worker.log` holds only the startup banner and
`celery_worker.err` holds every task line. Read the `.err` file.

`ecosystem.dev.config.js` is the dev list; `ecosystem.config.js` is the deployed one and
should not be used here. The dev list runs `celery_worker`, `watch`, and
`manage_upload_workflows`, and leaves out the nightly purge and metrics crons.

## Restarting is usually unnecessary

`celeryconfig.py` sets `worker_max_tasks_per_child = 1`, so every task runs in a fresh
child process that re-imports the task module. Editing the body of a task takes effect on
the next task with no restart at all.

Restart only after changing `workers/tasks/declarations.py`, anything under
`workers/config/`, or `celery_app.py`.

## What must be running first

| Service | Where | Checked with |
|---|---|---|
| Postgres | docker, `bioloop-postgres-1` | `docker ps` |
| API | `bin/devserver.sh up api` | `curl localhost:3030/health` |
| RabbitMQ | outside this repo, port 5672 | `nc -z localhost 5672` |
| MongoDB | outside this repo, port 27017 | `nc -z localhost 27017` |
| rhythm API | outside this repo, port 5001 | `curl localhost:5001/health` |

RabbitMQ, MongoDB, and rhythm are not in this repository's `docker-compose.yml` path for
native development; they are started separately.

**The API must point at the right rhythm port.** `api/.env` shipped with
`WORKFLOW_SERVER_BASE_URL=http://localhost:5000` while rhythm listens on 5001. With the
wrong port every workflow the API starts fails, and the failure surfaces in the UI as a
dataset stuck in `REGISTERED` rather than as a connection error.

## workers/.env

Copy `workers/.env.dev.example` to `workers/.env` and fill in the token. The file is
gitignored. Two fields cause most of the trouble:

- **`APP_ENV=dev`** selects `workers/workers/config/dev.py`. Leaving it empty is not a
  default, it is a broken config: `common.py` ships placeholder paths like
  `/path/to/source/raw_data`, and the watch script will happily poll them forever.
- **`APP_API_TOKEN`** is a never-expiring JWT for the seeded `svc_tasks` account, minted
  with `cd api && node src/scripts/issue_token.js svc_tasks`. It survives a
  `prisma migrate reset`: `ensureSvcTasksAccount()` creates the account at pinned ids, so
  the `profile.id` and `profile.subject_id` in the token stay valid across reseeds. A token
  minted before that pinning landed still has the old generated `subject_id` and must be
  reissued once.

  The pinned ids are what a reset gives you, not a guarantee. On a database where something
  else already holds `user.id` 1 or the pinned subject id, `ensureSvcTasksAccount()` creates
  the account at generated ids instead and `npm run seed:prod` prints a note saying so. That
  costs nothing at runtime, because every consumer resolves the account by username, but it
  does mean the token has to be reissued after the account is created. Read the row rather
  than the constants when a token looks wrong.

  **Every `/v2` route needs `subject_id` in that token, and an old one does not carry it.**
  The claim was added to the JWT profile after the groups work started, so a token minted
  before then authenticates fine and then fails inside the policy engine. The API answers
  500 and logs `AuthorizationError: [policy:isPlatformAdmin] User identifier is required to
  evaluate policy`; the worker sees only `500 Server Error`. Decode the payload before
  guessing:

  ```
  python3 -c "import base64,json,sys;p=sys.argv[1].split('.')[1];p+='='*(-len(p)%4);print(json.loads(base64.urlsafe_b64decode(p)))" "$APP_API_TOKEN"
  ```

  A good token has `profile.subject_id` and a `profile.id` matching the current
  `svc_tasks` row. Reissue whenever either is missing or stale.

  **A stale token does not always produce an error status.** `POST /v2/datasets/bulk`
  answers `200` with every dataset in `errored` and an empty `created`, because it treats a
  per-dataset failure as data rather than as an exception. The cause is only in the API log:

  ```
  Error in bulkCreateDatasets: ... "code":"P2003","meta":{"constraint":"grant_granted_by_fkey"}
  ```

  `grant.granted_by` is NOT NULL and its foreign key is to `user.subject_id`, so seeding the
  owning group's grant fails when the token names a `subject_id` that no longer exists. Read
  the API log rather than the worker's output when a bulk create returns `errored` with no
  explanation.

A missing `API_BASE_URL` fails at import with a bare `KeyError: 'API_BASE_URL'` from
`common.py`, before any logging is set up. Every worker dies instantly and pm2 shows three
restarts. Check `workers/.env` before reading anything else.

## The API has to agree about two directories

The workers and the API share a filesystem, and two paths have to name the same place in
both. Both are absolute, and both are set in `api/.env`, which is gitignored:

```
UPLOAD_API_DIR=<repo>/data/uploads
UPLOAD_HOST_DIR=<repo>/data/uploads
IMPORT_SOURCES_DIR=<repo>/data/import
```

`UPLOAD_API_DIR` is `upload.api_dir`, the upload directory as the API process sees it:
TUS stages there and the API moves finished files under
`<type subdirectory>/<dataset id>/<name>`. `UPLOAD_HOST_DIR` is `upload.host_dir`, the same
directory as every other process sees it, recorded as the prefix of `dataset.origin_path`
so a worker can open the files later. Natively they are the same value, and `host_dir` may
be left empty; they differ only where the API reaches the filesystem by a different path,
which is the usual case in a container.

`IMPORT_SOURCES_DIR` is where `api/prisma/seed.js` puts the seeded `import_source` rows.
Those rows are an allowlist: `GET /fs` refuses to browse outside them, and
`POST /datasets` refuses an `origin_path` outside them.

**A relative path here looks like it works and does not.** `upload.api_dir` was once the
relative `data/uploads`, which resolves against the *process* working directory — one
place for the API, a different place for a worker. The API writes the file, records the
relative path, and the worker then cannot find it. Keep both absolute.

After changing `api/.env`, restart the API. `bin/devserver.sh restart api` — nodemon does
not reload environment variables, so an edit alone changes nothing and the symptom is a
stale value that no longer appears anywhere in the config files.

Repointing the import sources on an existing database is a direct update, because the seed
upserts on `path` and would otherwise add rows rather than move them:

```sql
UPDATE import_source SET path = replace(path, '/opt/sca/data/imports', '<repo>/data/import');
```

## Watched ingestion directories

`watch_v2.py` polls one directory per entry under `registration.ingestion` in
`workers/workers/config/<env>.py`. The key names the observer; the entry carries everything
else:

```python
'ingestion': {
    'raw_data': {
        'source_dir': str(RAW_DATA_DIR),
        'dataset_type': 'RAW_DATA',
        'owner_group_id': '83101409-...',
        'rejects': ['.snapshots', '_testObservedPath_*'],
    },
},
```

`source_dir`, `dataset_type`, and `owner_group_id` are required and raise at start-up when
absent. `rejects`, `workflow`, `poll_interval_seconds`, `full_scan_every_n_scans`, and
`max_retries` are optional. **Every other key becomes the dataset's metadata**, so adding an
instrument or intake tag to a directory needs no code change.

Each optional value has exactly one fallback, so no default is written twice. `workflow`
falls back to `DEFAULT_WORKFLOW` in `watch_v2.py`, and `RegisterV2` requires `wf_name` rather
than defaulting it, which is what keeps that literal single. `poll_interval_seconds` and
`full_scan_every_n_scans` fall back to the shared `registration` settings. `rejects` and
`batch_size` are passed through so `RegisterV2`'s defaults apply, and `max_retries` is not
passed at all unless configured, so `Observer`'s default applies. Put a new default in
whichever of the three owns that concern; do not add a second copy at the call site.

The dataset type is a property of the directory rather than the key, so two directories can
feed `RAW_DATA` under different owning groups.

```
python -m workers.scripts.watch_v2                    # every configured directory
python -m workers.scripts.watch_v2 --only raw_data    # one, repeatable
python -m workers.scripts.watch_v2 --dry-run          # log the payloads, create nothing
```

`--dry-run` is the fastest way to check a new entry: it prints the exact bulk request each
directory would send, including the owning group.

**Run `watch_v2.py` or `watch.py`, never both.** They poll the same directories and race to
register the same new subdirectory. The dev pm2 list runs `watch_v2`.

The legacy `registration.<TYPE>` blocks still exist because `scripts/watch.py`,
`tests/watch/`, and `setup_dirs` read them. In `dev.py` both shapes point at the same
`RAW_DATA_DIR` and `DATA_PRODUCT_DIR` locals, so they cannot drift.

## Directories

`workers/workers/config/dev.py` roots every path at the repository's `./data`, which is
gitignored. Create the tree with:

```
cd workers
poetry run python -m workers.scripts.setup_dirs --create=True
```

Run it with no flag to print `Exists`/`Missing` for each configured path without touching
anything. The two that matter day to day are `data/origin/raw_data` and
`data/origin/data_products`; the watch script registers any new subdirectory of either.

## The archive tier: `workers/storage/`

The archive step writes a dataset's tar bundle to SDA, IU's tape system, through the `hsi`
command line tools. `hsi` is not installed on a developer machine, and asking for it is not
reasonable.

`workers/workers/storage/` is one interface with two backends. `sda.py` shells out to
`hsi`; `posix.py` does the same seven operations with `shutil` and `pathlib`. The backend
is chosen by `config['storage']['backend']`, so `dev.py` and `docker.py` say `posix` and a
real deployment says `sda`.

Choosing by config rather than by `APP_ENV` is deliberate. There used to be four
`if app_env == 'docker':` branches scattered through `workflow_utils.py` and
`tasks/delete.py`, each with its own local-filesystem re-implementation. Do not add a fifth
of any kind; add a backend or a config value.

`get_hash` returns whatever digest its own backend records — the checksum SDA stored, or an
md5 from `utils.checksum`. The two are not comparable, and nothing needs them to be, because
an archive is only ever read by the backend that wrote it.

## Command line tools that do not exist on macOS

Two GNU-only things used to fail every run on a Mac, and both are now handled in
`workers/workers/cmd.py`. Do not reintroduce either.

- **`du -sb`.** BSD `du` has no `-b`. `cmd.total_size` walks the tree with `os.scandir`
  instead, matching `du -sb` semantics: apparent size, root directory included, symlinks
  measured but never followed.
- **`tar --sparse`.** The bsdtar shipped with macOS rejects the option outright.
  `cmd.tar_supports_sparse()` probes once with `tar --sparse --version` and drops the flag
  when the probe fails. No dataset here is sparse, so the flag buys nothing.

`fastqc`, `multiqc`, and `sendmail` are also absent, and that is accepted. They are reached
only from `tasks/qc.py` and `cmd.send_email`, neither of which is in the `integrated`
workflow. Those tasks will error, and that is fine.

## Checking the whole chain works

Drop a directory into the watched path and follow it:

```
mkdir -p data/origin/raw_data/probe_01
head -c 2000000 /dev/urandom > data/origin/raw_data/probe_01/reads.fastq.gz
tail -f logs/workers/watch.err logs/workers/celery_worker.err
```

The watch script polls every 10 seconds. `await_stability` then waits for the directory to
stop changing, which `dev.py` sets to 30 seconds rather than the production hour. Roughly
40 seconds after the copy the dataset should walk `REGISTERED`, `READY`, `ARCHIVED`,
`FETCHED`, `STAGED`:

```
docker exec bioloop-postgres-1 psql -U appuser -d app \
  -c "select state, timestamp from dataset_state ds
      join dataset d on d.id = ds.dataset_id
      where d.name = 'probe_01' order by timestamp;"
```

A dataset that reaches `REGISTERED` and stops means the API could not start the workflow;
check the rhythm port. A dataset that never appears means the watch script is polling a
placeholder path; check `APP_ENV`.

## Tests

```
cd workers
poetry install --with dev                       # pytest is in the dev group
poetry run pytest tests/upload                  # 8 unit tests, needs nothing running
poetry run pytest tests/watch -m "not slow"     # 5 integration tests, ~1s
poetry run pytest tests/watch -m slow           # full integrated workflow, ~20s
```

`tests/watch` drives the real `Register` and `Observer` from `workers/scripts/watch.py`,
publishes to the real queue, and asserts on what the API and rhythm recorded. It does not
start a worker of its own: it needs one already subscribed to `<app_id>.q`, which is the
pm2 `celery_worker`. There used to be a `tests/scripts/start_worker.sh` that started a
second worker on that same queue with a different task registry. Do not bring that back —
two workers on one queue split the tasks between them at random.

Each test creates its isolation directory as `_testObservedPath_<uuid>` inside the same
`source_dir` the long-running pm2 `watch` process polls. That prefix is in the `rejects`
list of `dev.py` and `docker.py`, which is the only thing stopping `watch` from
registering the test's datasets as real ones. Keep it there.

`tests/register_ondemand` holds nine standalone scripts, not pytest tests, and
`pytest.ini` excludes the directory with `norecursedirs`. See the README beside them.

## Traps

**`pm2 restart` does not re-read the ecosystem file.** pm2 stores each app's script path
and arguments when it first starts it, and `restart` replays what it stored. `--update-env`
refreshes environment variables only, not `args`. So changing a process's module in
`ecosystem.dev.config.js` and restarting silently keeps running the old module.

This cost a session on 2026-09-08: `watch` was pointed at `workers.scripts.watch_v2`, pm2
restarted, and the v1 `watch` kept registering datasets with no owning group. The evidence
is one command:

```
pm2 describe watch | grep "script args"
```

To actually apply a changed `args`, delete and start:

```
pm2 delete watch && pm2 start ecosystem.dev.config.js --only watch
```

**`poetry run pytest` can run the wrong pytest.** A plain `poetry install` skips the dev
group, so no pytest exists in `workers/.venv`. `poetry run` then falls through to whatever
is on PATH — conda's pytest here — which cannot import the venv's packages. The failure
reads as a dozen collection errors saying `No module named 'glom'` and looks like a broken
checkout. Run `poetry install --with dev`, or install just what the suite needs
(`pytest`, `pytest-timeout`, `pytest-asyncio`) to avoid pulling jupyterlab and diagrams.

**pm2 and the celery pid file.** The deployed `ecosystem.config.js` passes
`--pidfile celery_worker.pid`, and `workers/bin/entrypoint.sh` clears a stale one before
starting. pm2 does not. `ecosystem.dev.config.js` therefore omits `--pidfile`; if you add it
back, a worker that crashes will refuse every subsequent restart with a message about the
pid file already existing.

**A task that spawns a subprocess must use `sys.executable`, never `'python'`.** A bare
`python` is resolved from PATH, and under pm2 that is whatever interpreter the shell
offers rather than `workers/.venv/bin/python`. Upload verification once did this, so every
upload stalled in VERIFYING while the subprocess died on
`ModuleNotFoundError: No module named 'glom'` at the first `from workers import ...`.

The failure was hard to read because `cmd.execute_with_log_tracking` reports only
`SubprocessError` with a return code, and the real traceback goes to the `log` table.
Verification now runs in-process and raises its own exception type, but every remaining
`cmd.execute` call still runs an external binary, so the rule stands for those.

**Do not reach for a subprocess to get logs into the UI.** `log_tracking.track_task_logs`
attaches a logging handler that posts to the same `workflows/processes/<id>/logs` endpoint
`execute_with_log_tracking` uses, so in-process work shows up on `/datasets/uploads/:id`
without losing the exception type. `cmd.execute_with_log_tracking` is for a genuinely
external command whose stdout is the only thing to read.

To read the captured lines directly:

```sql
SELECT level, message FROM log WHERE worker_process_id = <id> ORDER BY id;
```

The `poetry run pytest` trap below is the same PATH mistake in a different costume.

**Names must match on both sides of the queue.** The celery queue is
`<app_id>.q`, and `app_id` is `bioloop-dev.sca.iu.edu` in both `api/config/default.json`
and `workers/workers/config/common.py`. Change one and tasks are published to a queue
nobody consumes, with no error anywhere.

**The vhost lives inside `QUEUE_URL`.** It is `localhost:5672/myvhost`, not a separate
setting. A wrong vhost shows up as celery retrying the broker connection forever in
`celery_worker.err`.

## Keeping this current

Amend this file whenever you hit something it does not mention: another missing command
line tool, another environment variable that fails at import, another process worth adding
to the dev list. Record dead ends explicitly, and verify a claim against the running
processes before writing it down.

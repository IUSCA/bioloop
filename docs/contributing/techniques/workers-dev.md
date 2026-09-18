---
title: Running the workers locally
---

# Running the workers locally

This page is the reference behind the agent skill at `.claude/skills/workers-dev/SKILL.md`.
The skill holds the commands and the traps. This page holds the reasoning and the detail.

The step-by-step setup for a person is [Workers (local)](../../guides/workers-local.md). The
API, UI, and notification worker are managed by `bin/devserver.sh`, which the `dev-servers`
skill covers.

## The service-account token

`APP_API_TOKEN` is a never-expiring JWT for the seeded `svc_tasks` account. Mint it with
`cd api && node src/scripts/issue_token.js svc_tasks`.

`ensureSvcTasksAccount()` in `api/src/services/system_accounts.js` creates the account at
pinned ids. So a token normally survives `prisma migrate reset`, because `profile.id` and
`profile.subject_id` stay the same across reseeds. The pinned ids are what a reset gives, not
a guarantee. When another row already holds a pinned id, the account gets generated ids and
the token must be reissued. Every consumer resolves the account by username, so this costs
nothing at runtime. Read the `user` row rather than the constants when a token looks wrong.

Every `/v2` route needs `subject_id` in the token. A token without it authenticates and then
fails inside the policy engine. The API answers 500 and logs
`AuthorizationError: [policy:isPlatformAdmin] User identifier is required to evaluate policy`.
The worker sees only `500 Server Error`.

A stale token does not always produce an error status. `POST /v2/datasets/bulk` treats a
per-dataset failure as data. It answers 200 with every dataset in `errored` and an empty
`created`. The cause appears only in the API log:

```
Error in bulkCreateDatasets: ... "code":"P2003","meta":{"constraint":"grant_granted_by_fkey"}
```

`grant.granted_by` is NOT NULL and references `user.subject_id`. Seeding the owning group's
grant fails when the token names a `subject_id` that no longer exists.

## The shared directories

The workers and the API share a filesystem. Three settings in `api/.env` name places both
must agree on, and all three are absolute:

```
UPLOAD_API_DIR=<repo>/data/uploads
UPLOAD_HOST_DIR=<repo>/data/uploads
IMPORT_SOURCES_DIR=<repo>/data/import
```

`UPLOAD_API_DIR` is `upload.api_dir`, the upload directory as the API process sees it. TUS
stages files there, and the API moves finished files under
`<type subdirectory>/<dataset id>/<name>`. `UPLOAD_HOST_DIR` is `upload.host_dir`, the same
directory as every other process sees it. It is recorded as the prefix of
`dataset.origin_path`, so a worker can open the files later. Natively the two are equal, and
`host_dir` may be empty. They differ where the API reaches the filesystem by another path,
as in a container.

A relative path resolves against each process's working directory. The API then writes a
file where the worker cannot find it.

`IMPORT_SOURCES_DIR` is where `api/prisma/seed.js` points the seeded `import_source` rows.
Those rows are an allowlist. `GET /fs` refuses to browse outside them, and dataset creation
refuses an `origin_path` outside them.

The seed upserts on `path`, so rerunning it after changing the directory adds rows rather
than moving them. Repoint existing rows directly:

```sql
UPDATE import_source SET path = replace(path, '<old prefix>', '<repo>/data/import');
```

## Watched ingestion directories

`watch_v2.py` polls one directory per entry under `registration.ingestion` in
`workers/workers/config/<env>.py`. The key names the observer, and the entry carries
everything else:

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

`source_dir`, `dataset_type`, and `owner_group_id` are required, and a missing one raises at
startup. `rejects`, `workflow`, `poll_interval_seconds`, `full_scan_every_n_scans`, and
`max_retries` are optional. Every other key becomes dataset metadata, so an instrument or
intake tag needs no code change. A key matching a `RegisterV2` parameter, such as
`batch_size`, binds to that parameter instead.

Each optional value has exactly one fallback:

- `workflow` falls back to `DEFAULT_WORKFLOW` in `watch_v2.py`. `RegisterV2` requires
  `wf_name` rather than defaulting it, so the literal lives in one place.
- `poll_interval_seconds` and `full_scan_every_n_scans` fall back to the shared
  `registration` settings.
- `rejects` passes through, so `RegisterV2`'s default applies.
- `max_retries` is passed only when configured, so `Observer`'s default applies.

Put a new default in whichever of the three owns that concern, never at the call site.

The dataset type belongs to the directory rather than the key. Two directories can feed
`RAW_DATA` under different owning groups.

The legacy `registration.<TYPE>` blocks remain because `scripts/watch.py`, `tests/watch/`, and
`setup_dirs` read them. In `dev.py` both shapes use the same `RAW_DATA_DIR` and
`DATA_PRODUCT_DIR` locals, so they cannot drift.

## Directories

`workers/workers/config/dev.py` roots every path at the repository's gitignored `./data`.
`poetry run python -m workers.scripts.setup_dirs --create=True` creates the tree. With no flag
it prints `Exists` or `Missing` for each path. The watch script registers any new
subdirectory of `data/origin/raw_data` or `data/origin/data_products`.

## The archive tier: `workers/workers/storage/`

The archive step writes a dataset's tar bundle to SDA, IU's tape system, through the `hsi`
tools. `hsi` is not installed on a developer machine.

`workers/workers/storage/` is one interface with two backends. `sda.py` shells out to `hsi`.
`posix.py` does the same operations with `shutil` and `pathlib`. `config['storage']['backend']`
chooses the backend: `posix` in `dev.py` and `docker.py`, and `sda` in `common.py`. The choice
is by config rather than by `APP_ENV`, so environment-specific behaviour is a backend or a
config value, never an `if app_env == ...` branch.

`get_hash` returns the digest its own backend records: the checksum SDA stored, or an md5 from
`utils.checksum`. The two are not comparable. Nothing compares them, because only the backend
that wrote an archive reads it.

## Command-line tools on macOS

`workers/workers/cmd.py` handles two GNU-only features:

- **`du -sb`.** BSD `du` has no `-b`. `cmd.total_size` walks the tree with `os.scandir` and
  matches `du -sb`: apparent size, root directory included, symlinks measured but not
  followed.
- **`tar --sparse`.** macOS bsdtar rejects the option. `cmd.tar_supports_sparse()` probes once
  and drops the flag when the probe fails. No dataset here is sparse.

`fastqc`, `multiqc`, and `sendmail` are absent, and that is accepted. Only `tasks/qc.py` and
`cmd.send_email` reach them, and neither is in the `integrated` workflow.

## Checking the whole chain

Drop a directory into the watched path and follow the logs:

```
mkdir -p data/origin/raw_data/probe_01
head -c 2000000 /dev/urandom > data/origin/raw_data/probe_01/reads.fastq.gz
tail -f logs/workers/watch.err logs/workers/celery_worker.err
```

`dev.py` shortens the stability thresholds, so the dataset registers within a minute. It then
walks `REGISTERED`, `READY`, `ARCHIVED`, `FETCHED`, and `STAGED`:

```
docker exec bioloop-postgres-1 psql -U appuser -d app \
  -c "select state, timestamp from dataset_state ds
      join dataset d on d.id = ds.dataset_id
      where d.name = 'probe_01' order by timestamp;"
```

A dataset stuck at `REGISTERED` means the API could not start the workflow, so check
`WORKFLOW_SERVER_BASE_URL` in `api/.env` against rhythm's port 5001. A dataset that never
appears means the watch script is polling a placeholder path, so check `APP_ENV`.

## Tests

`tests/upload` holds unit tests that need nothing running. `tests/watch` drives the real
`Register` and `Observer`, publishes to the real queue, and asserts on what the API and rhythm
recorded. It starts no worker of its own and needs the pm2 `celery_worker` subscribed to
`<app_id>.q`. A second worker on that queue with a different task registry splits the tasks
at random.

Each watch test creates `_testObservedPath_<uuid>` inside the `source_dir` the pm2 `watch`
process polls. That prefix is in the `rejects` list of `dev.py` and `docker.py`, which is the
only thing that stops `watch` registering the test's datasets as real ones.

`tests/register_ondemand` holds standalone scripts, not pytest tests. `pytest.ini` excludes the
directory with `norecursedirs`.

## Task logs in the UI

`log_tracking.track_task_logs` attaches a logging handler that posts to the
`workflows/processes/<id>/logs` endpoint. In-process work therefore shows its log lines on
`/datasets/uploads/:id` and keeps its exception type. `cmd.execute_with_log_tracking` is for a
genuinely external command whose stdout is the only thing to read. It reports only a
`SubprocessError` with a return code, and the real traceback goes to the `log` table:

```sql
SELECT level, message FROM log WHERE worker_process_id = <id> ORDER BY id;
```

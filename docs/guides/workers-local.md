---
title: Workers (local)
order: 5
---

# Running the workers without Docker

The workers are three Python processes. They register datasets that appear on disk, run the
`integrated` workflow, and push uploads through verification. `bin/devserver.sh` runs the
API and the UI; it does not run these. pm2 does.

The agent-facing version of this page, with the traps and the reasoning, is
`.claude/skills/workers-dev/SKILL.md`.

## Before you start

Postgres and the API come from this repository. RabbitMQ, MongoDB, and the rhythm API do
not, and you start them yourself.

```bash
docker ps                        # bioloop-postgres-1 running
bin/devserver.sh status          # api and ui running
nc -z localhost 5672             # RabbitMQ
nc -z localhost 27017            # MongoDB
curl -s localhost:5001/health    # rhythm
```

Check that `api/.env` has `WORKFLOW_SERVER_BASE_URL=http://localhost:5001`. rhythm listens
on 5001, and with the wrong port every workflow the API starts fails silently.

## One-time setup

```bash
cp workers/.env.dev.example workers/.env
cd api && node src/scripts/issue_token.js svc_tasks     # paste into APP_API_TOKEN
```

The token is a never-expiring JWT for the seeded `svc_tasks` account. Reissue it after
`prisma migrate reset`, which gives that account a new subject id.

The API needs to agree with the workers about two directories. Add these to `api/.env`,
using absolute paths, and restart the API afterwards — nodemon does not reload environment
variables:

```
UPLOAD_API_DIR=/absolute/path/to/bioloop/data/uploads
UPLOAD_HOST_DIR=/absolute/path/to/bioloop/data/uploads
IMPORT_SOURCES_DIR=/absolute/path/to/bioloop/data/import
```

`UPLOAD_API_DIR` and `UPLOAD_HOST_DIR` name the same upload directory from two vantage
points: the first as the API process sees it, the second as the workers see it. They differ
only inside a container, so natively they are the same value. `IMPORT_SOURCES_DIR` is where
the seeded import sources point, and the import UI can only browse inside them.

Relative paths do not work here: they resolve against each process's own working directory,
so the API and a worker would disagree about where a file is.

Then install dependencies and create the data directories:

```bash
cd workers
poetry install
poetry run python -m workers.scripts.setup_dirs --create=True
```

Everything lands under the repository's `./data`, which is gitignored. Run `setup_dirs`
with no flag any time to see which paths exist.

## Day to day

```bash
cd workers
pm2 start ecosystem.dev.config.js
pm2 list
pm2 logs celery_worker
pm2 restart watch
pm2 delete ecosystem.dev.config.js
```

Logs also go to `logs/workers/`. Celery writes task output to stderr, so read
`celery_worker.err` rather than `celery_worker.log`.

You rarely need to restart. Celery runs each task in a fresh child process, so editing the
body of a task takes effect on the next task. Restart after changing
`workers/workers/tasks/declarations.py`, anything under `workers/workers/config/`, or
`celery_app.py`.

## Checking it works

```bash
mkdir -p data/origin/raw_data/probe_01
head -c 2000000 /dev/urandom > data/origin/raw_data/probe_01/reads.fastq.gz
tail -f logs/workers/watch.err logs/workers/celery_worker.err
```

The watch script polls every ten seconds, then `await_stability` waits for the directory to
stop changing. About forty seconds later the dataset should have walked `REGISTERED`,
`READY`, `ARCHIVED`, `FETCHED`, and `STAGED`, and be visible in the UI.

The `watch` process runs `workers.scripts.watch_v2`, which registers through
`POST /v2/datasets/bulk`. Every dataset it creates carries the owning group configured for
its ingestion directory under `registration.ingestion`, so a scanned dataset arrives already
governed. `python -m workers.scripts.watch_v2 --dry-run` prints the request each directory
would send without creating anything.

If it stops at `REGISTERED`, the API could not reach rhythm. If it never appears at all,
`APP_ENV` is not `dev` and the watch script is polling a placeholder path. If the API answers
500, check that `APP_API_TOKEN` carries a `subject_id`: every `/v2` route reads it, and a
token minted before the groups work does not have one.

## Import and upload

Both legacy flows work once the directories above are set.

**Import** registers a directory that is already on disk; nothing is copied. Put a
directory under `data/import/genomics_lab_instrument_drop/`, then go to
`/datasets/imports/new`, pick the source, and type part of the directory name. The
typeahead only searches while its dropdown is open.

**Upload** sends files from the browser. Go to `/datasets/uploads/new`, choose a file, and
finish the stepper. The dataset appears immediately in `UPLOADING`; the
`manage_upload_workflows` cron then moves it through `UPLOADED`, `VERIFYING`, `VERIFIED`,
`PROCESSING`, and `COMPLETE`, which takes a minute or two because the cron runs once a
minute. `/datasets/uploads/:id` shows the current status and the verification task's own
logs.

Both features are gated to the `admin` role in `ui/src/config.js` under `enabledFeatures`.

## What is different from a real deployment

**The archive is a directory.** In production the archive step writes to SDA, IU's tape
system, through the `hsi` tools. `hsi` is not installed on a developer machine, so
`workers/workers/storage/` offers the same seven operations over ordinary files instead.
The backend is chosen by `config['storage']['backend']`, which is `posix` for both dev and
docker and `sda` for a real deployment.

**Some commands are missing and that is fine.** `fastqc`, `multiqc`, and `sendmail` are not
installed. Only the QC task and the email helper use them, and neither is part of the
`integrated` workflow. Those tasks will error if you run them.

**Thresholds are short.** `workers/workers/config/dev.py` waits thirty seconds for a
dataset to look stable rather than the production hour, so a test dataset registers while
you are still watching.

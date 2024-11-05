# Workers

## Coding Guidelines

### Hierarchical Config

- The default & dev config goes into `workers/config/common.py`
- The overrides for production goes into `workers/config/production.py`
- Based on the environment variable APP_ENV, config from that file is imported and merged with the common config.
  - Add APP_ENV=production to `.env` file which load_dotenv reads or
  - directly set it as `export APP_ENV=production`.
- In project files, import config as `from workers.config import config`
- Imported config is a [DotMap](https://pypi.org/project/dotmap/) object, which supports both `config[]` and `config.`
  access.
- To add a new environment (for example "stage"), create a new file inside `workers/config` called `stage.py` and have
  the overriding config as a dict assigned to a variable named `config`.

### Celery config

- config specific to Celery is in `workers/config/celeryconfig.py`
- Config is in python values, instead of a dict
- Env specific values and secrets are loaded from `.env` file

### Code Organization

- Celery Tasks: `workers/tasks/*.py`
- Scheduled job and other scripts: `workers/scripts/*.py`
- Helper code: `workers/*.py`
- Config / settings are in `workers/config/*.py` and `.env`
- Test code is in `tests/`

### Parallel tasks limit

The maximum number of active (i.e. not 'PENDING') tasks that can run at a time is determined by the number of Celery workers, which is currently set to 8.

This config can be found in `ecosystem.config.js`, under app `celery_worker`:

```
-m celery -A workers.celery_app worker ... --autoscale=8,2
```

### Hot Module Replacement

Worker automatically run with updated code except for the code in

- workers.config.*
- workers.utils
- workers.celery_app
- workers.task.declaration

## Deployment

- Add `module load python/3.10.5` to ~/.modules
- Update `.env` (make a copy of `.env.example` and add values)
- Install dependencies

```bash
poetry export --without-hashes --format=requirements.txt > requirements.txt
pip install -r requirements.txt
```

```bash
cd ~/app/workers
pm2 start ecosystem.config.js
# optional
pm2 save
```

## Testing with workers running on local machine

Start mongo and queue

```bash
cd <rhythm_api>
docker-compose up queue mongo -d
```

Start Workers

```bash
python -m celery -A tests.celery_app worker --loglevel INFO -O fair --pidfile celery_worker.pid --hostname 'bioloop-celery-w1@%h' --autoscale=2,1 --queues 'bioloop-dev.sca.iu.edu.q'
```

`--concurrency 1`: number of worker processed to pre-fork

`-O fair`: Optimization profile, disables prefetching of tasks. Guarantees child processes will only be allocated tasks
when they are actually available.

Use `--hostname '<app_name>-celery-<worker_name>@%h'` to distinguish multiple workers running on the same machine either
for the same app or different apps.

- replace `<app_name>` with app name (ex: bioloop)
- replace `<worker_name>` with worker name (ex: w1)

Auto-scaling - max_concurrency,min_concurrency
`--autoscale=10,3` (always keep 3 processes, but grow to 10 if necessary).

`--queues '<app_name>-dev.sca.iu.edu'` comma separated queue names. worker will subscribe to these queues for accepting tasks.
Configured in `workers/config/celeryconfig.py` with `task_routes`, `task_default_queue`

Run test

```bash
python -m tests.test
```

## Testing with workers running on COLO node and Rhythm API

There are no test instances of API, rhythm_api, mongo, postgres, queue running.
These need to be run in local and port forwarded through ssh.

- start postgres locally using docker

```bash
cd <app_name>
docker-compose up postgres -d
```

- start rhythm_api locally

```bash
cd <rhythm_api>
docker-compose up queue mongo -d
poetry run dev
```

- start UI and API locally

```bash
cd <app_name>/api
pnpm start
```

```bash
cd <app_name>/ui
pnpm dev
```

- Reverse port forward API, mongo and queue. let the clients on remote machine talk to a server
  running on the local machine.
  - API - local port - 3030, remote port - 3130
  - Mongo - local port - 27017, remote port - 28017
  - queue - local port - 5672, remote port - 5772

```bash
ssh \
  -A \
  -R 3130:localhost:3030 \
  -R 28017:localhost:27017 \
  -R 5772:localhost:5672 \
  bioloopuser@workers.iu.edu
```

- pull latest changes in dev branch to `<bioloop_dev>`

```bash
colo23> cd <app_dev>
colo23> git checkout dev
colo23> git pull
```

- create / update `<app_dev>/workers/.env`
- create an auth token to communicate with the express server (postgres db)
  - `cd <app>/api`
  - `node src/scripts/issue_token.js <service_account>`
  - ex: `node src/scripts/issue_token.js svc_tasks`
  - docker ex: `sudo docker compose -f "docker-compose-prod.yml" exec api node src/scripts/issue_token.js svc_tasks`

- install dependencies using poetry and start celery workers

```bash
colo23> cd workers
colo23> poetry install
colo23> poetry shell
colo23> python -m celery -A workers.celery_app worker --loglevel INFO -O fair --pidfile celery_worker.pid --hostname 'bioloop-dev-celery-w1@%h' --autoscale=2,1
```


Dataset Name:
- taken from the name of the directory ingested
- used in watch.py to filter out registered datasets
- used to compute the staging path `staging_dir / alias / dataset['name']`
- used to compute the qc path `Path(config['paths'][dataset_type]['qc']) / dataset['name'] / 'qc'`
- used to compute the scratch tar path while downloading the tar file from SDA `Path(f'{str(compute_staging_path(dataset)[0].parent)}/{dataset["name"]}.tar')`

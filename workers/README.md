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

## Deployment

- Add `module load python/3.10.5` to ~/.modules
- Update `.env` (make a copy of `.env.example` and add values)

```bash
cd ~/DGL/workers
pm2 start ecosystem.config.js
```

## Start only celery tasks

```bash
cd ~/DGL/workers
python -m celery -A workers.celery_app worker --concurrency 8
```

## Testing

There are no test instances of API, rhythm_api, mongo, postgres, queue running.
These need to be run in local and port forwarded through ssh.

- start postgres, mongo and queue locally using docker

```bash
cd <dgl>
docker-compose up postgres mongo queue -d
```

- start rhythm_api locally

```bash
cd <rhythm_api>
poetry run dev
```

- start UI and API locally

```bash
cd <dgl>/api
pnpm start
```

```bash
cd <dgl>/ui
pnpm dev
```

- Reverse port forward API, mongo and queue. let the clients on remote machine talk to a server
  running on the local machine.
  - API - local port - 3030, remote port - 3031
  - Mongo - local port - 27017, remote port - 27018
  - queue - local port - 5672, remote port - 5673

```bash
ssh \
  -A \
  -R 3031:localhost:3030 \
  -R 27018:localhost:27017 \
  -R 5673:locahost:5762 \
  dgluser@colo23.carbonate.uits.iu.edu
```

- pull latest changes in dev branch to `~/DGL_test`

```bash
colo23> cd <DGL_test>
colo23> git checkout dev
colo23> git pull
```

- create / update `<DGL_test>/workers/.env`
- Run `python -m celery -A workers.celery_app worker --concurrency 8` in `~/DGL_test/workers`



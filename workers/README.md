# Workers

## Deployment

Add `module load python/3.10.5` to ~/.modules

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

- Reverse port map API, mongo and queue. let the clients on remote machine talk to a server
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

- changes in `workers/config/config.py` to dgl_test.sca.iu.edu
  - project name
  - paths.scratch
  - paths.raw_data.archive
- change api, mongo and queue config in `workers/.env`
- Run `python -m celery -A workers.celery_app worker --concurrency 8` in `~/DGL_test/workers`



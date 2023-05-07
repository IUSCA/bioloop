# Workers

## Celery Workers

Add `module load python/3.10.5` to ~/.modules

```bash
cd /opt/sca/dgl/workers
pm2 start ecosystem.config.js
```

```bash
python -m celery -A workers.celery_app worker --concurrency 8
```

## Worker API

### seed the mongo db

```bash
cd .. # go to project root where docker-compose.yml is
mkdir -p db/mongodump
cp workers/mongo/*.json db/mongodump/
docker-compose up mongo -d
docker-compose exec mongo bash

$ cd /opt/sca/app/mongodump
$ mongoimport --uri 'mongodb://root:example@localhost:27017/?authSource=admin' --jsonArray --db celery --collection celery_taskmeta --file celery_taskmeta.json
$ mongoimport --uri 'mongodb://root:example@localhost:27017/?authSource=admin' --jsonArray --db celery --collection workflow_meta --file workflow_meta.json
```

### start the api server

```bash
gunicorn -p app.pid --bind :5001 --tasks 1 --threads 1 --timeout 0 workers.app:app
```

```bash
python -m workers.app
```

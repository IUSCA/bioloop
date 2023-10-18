## Create a repository

Fork this repo IUSCA/<app_name> (only the org owners can do this, ask Charles.)

Turn on issues in the new repo (only repo owners can do this, ask Charles.)

Clone repository
```bash
git clone <url>
cd <project>
```

Add bioloop as remote
```bash
git remote add bioloop git@github.com:IUSCA/bioloop.git

# to merge updates from bioloop
# git fetch bioloop
# git merge bioloop/main
```

Replace the name "bioloop" with the new project name (<app_name>) in these files:
- docker-compose.yml and docker-compose-prod.yml: Change "name"
- ui/src/config.js - Change "appTitle"
- api/config/default.json and api/config/production.json: Change "app_id", "auth.jwt.iss"
- workers/workers/config/common.py: Change "app_id" and "service_user"
- workers/workers/config/production.py and workers/workers/scripts/start_worker.sh: Change "app_id" and "base_url"
- workers/ecosystem.config.js (line 7): change celery hostname and queues values
- README.md and workers/README.md: replace the references to bioloop with <app_name>
- Update content in `ui/src/pages/about.vue` 
- Create custom logo.svg

## Steps to setup API and run natively on development machine (not using docker)

- Create .env file
- Generate token signing key pair
- Install dependencies
- Generate API Doc

```bash
cd api/
cp .env.example .env

cd keys
./genkeys.sh
cd ..

npm install && npm install --save-dev
npm run swagger
```

This step is required only if you are working with workflows, otherwise you can set `WORKFLOW_AUTH_TOKEN` to any value and API calls to Rhythm API will fail but the App will still run.

Generate an access token to connect to the [Rhythm API](https://github.com/IUSCA/rhythm_api).
- Go to Rhythm API instance (local or deployed)- `cd <rhythm_api>`
- If rhythm api is running locally: `python -m rhythm_api.scripts.issue_token --sub <app-id>`
- If rhythm api is running in docker: `sudo docker compose -f "docker-compose-prod.yml" exec api python -m rhythm_api.scripts.issue_token --sub <app-id>`


Make these changes to the api/.env file:
- set NODE_ENV to default (TODO: WARNING: NODE_ENV value of 'default' is ambiguous. WARNING: See https://github.com/node-config/node-config/wiki/Strict-Mode)
- Change the hostname in DATABASE_URL to localhost
```bash
NODE_ENV=default
WORKFLOW_AUTH_TOKEN=<token>
DATABASE_URL="postgresql://appuser:example@localhost:5432/app?schema=public"
```


- Initialize database
- Set up schema
- Populate with dummy data

```bash
docker-compose up -d postgres
cd api/
npx prisma db push
npx prisma db seed
```

Start the server: `npm run start`

## Steps to setup UI and run natively on development machine (not using docker)

- Create .env file
- Create self-signed certificate for https://localhost 
- install dependencies

```bash
cd ui/
cp .env.example .env

mkdir .cert
openssl req -subj '/CN=localhost' -x509 -newkey rsa:4096 -nodes -keyout ./.cert/key.pem -out ./.cert/cert.pem

npm install && npm install --save-dev
```
Make these changes to ui/.env file:
- change the hostname in VITE_API_REDIRECT_URL to localhost

```bash
VITE_API_REDIRECT_URL=http://localhost:3030
```

Start the vite server: `npm run dev`


## Set Up Workers locally

Running workers on your dev machine has limitations:
- Cannot work with SDA - cannot install `hsi` on dev machine.
- Difficult to test with large files (~100GB)
- Workers run external commands - `tar`, `fastqc`, `multiqc` whose interface and behavior may change between OS platforms.
- Working with mounted file systems (Slate Scratch, and others) has its own quirks which you will not encounter on your dev machine.

Steps:
- Install [miniconda](https://docs.conda.io/en/latest/miniconda.html)

- Create a virtual environment: `conda create -n colo python=3.9`
  - The production servers colo23, colo25 have python version 3.9.8 installed (as of June 2023). If the default python version in the production servers change, update it in your development machine too.

- Activate it: `conda activate colo`

- Install poetry - `pip install -U poetry`

- Install dependencies - `poetry install`
  - Poetry will detect it is running in a virtual environment and won't create another/

- Create .env
```bash
cd workers
cp .env.example .env
```

- Generate an auth token to access the app api and add it to .env against `AUTH_TOKEN`.

```bash
cd api/
node src/scripts/issue_token.js svc_tasks
```

- Workers connect to the mongodb and rabbitmq of a Rhythm API instance. You can either [setup a Rhythm API instance locally](https://github.com/IUSCA/rhythm_api) or ~~connect to core-dev1.sca.iu.edu using Group VPN~~ (This option is not recommended as it is used for production now. We plan to use core.sca.iu.edu for production in the future.)

- Update paths in config for local development:  TODO

- Stat celery:
```bash
cd workers
workers/scripts/start_celery.sh
```

## Setup a Test Instance of Workers in colo nodes
There are no test instances of API, rhythm_api, mongo, postgres, queue running. These need to be run in local and port forwarded through ssh.

![image](https://github.com/IUSCA/bioloop/assets/1618149/7bf3fa0b-fff1-451a-8038-2a8e16910cca)


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
npm run start
```

```bash
cd <app_name>/ui
npm run dev
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
  bioloopuser@colo23.carbonate.uits.iu.edu
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

# Run via docker

Docker standardizes the server environment and makes it easier to get a local development environment set up and running. 

## Setup

Requires `docker`. Docker desktop should work too. 

For development purposes, shared volumes are used in `docker-compose.yml` to ensure container `node_modules` are not confused with host level `node_modules`. This approach also keeps `node_modules` folders out of the local directory to make it easier to `find` and `grep`.

To make adjustments to the way the application runs, edit and review [docker-compose.yml](https://github.com/IUSCA/bioloop/blob/main/docker-compose.yml).

The UI and API containers have been set to run on start up to install / update dependencies.

Set up the [front-end ui client](/ui/) or [back-end api server](/api/) as needed.

### .env files

`ui/`, `api/` and `workers/` all contain `.env.example` files. Copy these to a corresponding `.env` file and update values accordingly.

```
cp ui/.env.example ui/.env
cp api/.env.example api/.env
cp workers/.env.example workers/.env
```

### OpenSSL

```
cd ui/
mkdir .cert
openssl req -subj '/CN=localhost' -x509 -newkey rsa:4096 -nodes -keyout ./.cert/key.pem -out ./.cert/cert.pem 
```

```
cd api/keys
./genkeys.sh
```

> Note: when running under Windows, it may be necessary to run the openssl commands via Cygwin


## Setup Migration and Seed Database

Run the initial migration:

```
docker compose exec api bash
npx prisma migrate dev
```

Add any usernames you need to work with in `api/prisma/data.js` then seed the db:

```
npx prisma db seed
```


## Starting / Stopping

Use Docker Compose

Bring up the containers:

```
docker compose up -d
```

Make sure everything is running (no Exit 1 States):

```
docker compose ps
```

To shut down the containers:

```
docker compose down -v
```

To see what is going on in a specific container:

```
docker compose logs -f api
```


## Linting

To use linting with the docker setup you must have the dev dependencies of the api and ui installed locally as well as the VSCode extention ESLint (dbaeumer.vscode-eslint).  You will need to run the install command for both api and ui:

```
npm install --save-dev
```

You can also install Dev Containers (ms-vscode-remote.remote-containers) to remote into both the api and ui containers separately.  You'd have to have two instances of vscode running, but if you don't want to install dependencies locally this is the best way to run with automatic linting.  

## Testing

Try it out how it is. Open a browser and go to:

https://localhost

You may need to specify the `https://` prefix manually. You may also have to accept a warning about an insecure connection since it's a self-signed certificate. The default configuration should be enough to get up and running.

Test the API with:

http://127.0.0.1:3030/health

To make more complex requests, use an API development tool like Hoppscotch or Insomnia:

https://hoppscotch.io/

To POST a request, choose `POST`, specify the URL, and in `Body` choose `application/x-www-form-urlencoded` for the `Content Type`


## Queue

This application makes use of the [Rhythm API](https://github.com/IUSCA/rhythm_api) for managing worker queues. 

Queue folders need to belong to docker group

```
db/queue/
chown -R ${USER}:docker db/queue/
```

## Quick start

Getting the user permissions set correctly is an important step in making the application run. 

```bash
bin/dev.sh
```
Run this script from the project root. 
- It creates a `.env` file in the project root which has the user id (uid) and group id (gid) of the project root directory's owner. The processes inside the api and worker_api docker containers are run as a user with this UID and GID.
- It builds both the api and worker_api images
- It runs all the containers (ui, api, worker_api, queue, postgres, mongo_db)


## Troubleshooting

Most containers have `curl` available. Connect to one and then try making requests to the service you're having issue with.

```
docker compose exec web bash
curl -X GET http://api:3030/
```

(in this case, we don't need the `/api` suffix since we're behind the nginx proxy that normally adds `/api` for us)

Also, you can always insert `console.log()` statements in the code to see what values are at any given point.

You can check which ports are available locally and find something unique.

```
netstat -panl | grep " LISTEN "
```


## Docker-compose

### -f

If you have a compose file named something other than `docker-compose.yml`, you can specify the name with a `-f` flag:

```
docker compose -f docker-compose-prod.yml up -d
```

## TIP: Shortcuts

Create bash aliases

The above commands can get tiring to type every time you want to take action with a compose environment. These shortcuts help.

Add the following to your .bashrc file (or equivalent)

```
alias dcu='docker compose up -d'
alias dcd='docker compose down --remove-orphans'
alias dcp='docker compose ps'
alias dce='docker compose exec'
alias dcl='docker compose logs'
```
via
https://charlesbrandt.com/system/virtualization/docker-compose.html#shell-shortcuts


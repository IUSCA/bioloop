# Run via docker

Docker standardizes the server environment and makes it easier to get a local development environment set up and running. 

## Setup

Requires `docker` and `docker-compose`. Docker desktop should work too. 

Shared volumes are used in `docker-compose.ymnl` to ensure container node_modules are not confused with host level node_modules. Keeps `node_modules` folders out of your local code to make it easier to `find` and `grep`

## Starting / Stopping

If you only memorize three docker commands, these are good ones to know.

Bring up the containers:

```
docker-compose up -d
```

Make sure everything is running (no Exit 1 States):

```
docker-compose ps
```

To shut down the containers:

```
docker-compose down -v
```

To see what is going on in a specific container:

```
docker-compose logs -f api
```

## Queue

Queue folders need to belong to docker group

```
chown -R ${USER}:docker db/queue/
```

## Configuration

Try it out how it is.

https://localhost

The default configuration should be enough to get up and running.

To make adjustments, edit and review [docker-compose.yml](docker-compose.yml).

Comment out containers that you don't currently need.

The UI and API containers have been set to run on start up to install / update dependencies.

Set up the [front-end ui client](ui/README-ui.md) or [back-end api server](api/README-api.md) as needed.

## Shortcuts

Create bash aliases

The above commands can get tiring to type every time you want to take action with a compose environment. These shortcuts help.

Add the following to your .bashrc file (or equivalent)

```
alias dcu='docker-compose up -d'
alias dcd='docker-compose down --remove-orphans'
alias dcp='docker-compose ps'
alias dce='docker-compose exec'
alias dcl='docker-compose logs'
```
via
https://charlesbrandt.com/system/virtualization/docker-compose.html#shell-shortcuts



## Troubleshooting

Most containers have `curl` available. Connect to one and then try making requests to the service you're having issue with.

```
docker-compose -p gpdb exec web bash
curl -X GET http://gpdb_api:3030/
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
docker-compose -p gpdb -f docker-compose-prod.yml up -d
```
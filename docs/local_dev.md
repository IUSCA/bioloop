# Local Development Setup in Docker

Our ecosystem has quite a few interconnected containers.  To facillitate a "one click" setup we use a docker compose setup for local development to get up and running quickly.  An important note on this - the base docker-compose.yml should not be used for production.  There are workarounds in our local dev setup that do not account for security in lieu of being able to automate the whole of the setup.

# Architecture

Here I'll lay out how our containers interact with one another in this setup.  We heavily use Health Checks, env file loading, Entrypoint Scripts/Commands, and Docker Networking with proxying through vite.   


## Health Checks

We use health checks to make sure that he containers have a healthy state set before other containers can start up.  The docker compose file uses health checks that look like this:

```yml
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3030/health"]
      interval: 30s
      timeout: 10s
      retries: 5
    depends_on:
      signet:
        condition: service_healthy
      postgres:
        condition: service_started
      rhythm:
        condition: service_healthy
```

to ensure that a service is up before we try to connect to it.  Here the api will not even start before the signet, postgres, and rhythm are marked as the condition listed.  This means the services with no dependencies on other will start first - in our case the databases. 

As for the api itself it will not be marked as "healhty" until the curl command listed in the test line comes back with a success condition. 

## Env files

We mount several .env files for loading environment variables and feeding in necessary base configuration for everything ranging from database credentials, file locations, and oauth or api tokens for cross container communications.  The env invocation in docker compose looks like this:

```yml
    env_file:
      - tests/.env.default # Variables needed for testing user information
      - db/postgres/.env.default # For Postgres connection settings
      - api/.env.default  # For all default settings
```
We have separated each .env to it's original purpose and mounted each to the container that needs it.  For instance our postgres .env.default has database credentials in it, but the api also needs these to connect to the database.  So the .env give the database container it's starting values which the first time it runs it will instantiate and it gives those values to the api by specifiying it in the api container block as well as the postges container block.  

Another note here we have multiple .env listed.  The last listed will take precedent over any listed first.  We take advantage of this by filling out a .env with token information for connecting the containers that need to communicate with one another.   After the container has been brought up the entrypoint scripts will create token information in the cases where it's needed puting it in a file just called .env.


## Entrypoint Scripts

Our compose utilizes entrypoint scripts to setup the container with any prerequite dependencies, setup auth tokens between the containers, and install seed data.  They look like this:

```yml
      entrypoint: ["bin/entrypoint.sh"] 
```

Each entrypoint script will be under it's microservice folder in the bin folder eg: `api/bin/entrypoint.sh`. Each of the entrypoint scripts for each container is heavily commented so I'm not going to go into detail here for what exactly each does, but I can give a high level overview of some techniques that would be important to understand.

Here is an example taken from our api's entrypoint script that checks to see if it has the environment variable WORKFLOW_AUTH_TOKEN and if it doesn't exists it sleeps the script to wait and avoid race conditions in one container waiting for another. 

```bash
# Check if pre-requisites are installed
while ! grep -q "^WORKFLOW_AUTH_TOKEN=[^ ]\+" ".env"; do
  echo "Waiting for .env file to be ready and contain WORKFLOW_AUTH_TOKEN..."
  sleep 1
done
```

This will dynamically load in any unloaded environment variables from .env which is not directly exported through compose since it needs to be dynamically generated.  

```bash
# Dynamically load environment variables from .env file
# This will export all variables in the .env file to the environment
# This ensure that the script can access the variables we generated during startup
export $(grep -v '^#' .env | xargs)
```

This will generate keys if they don't already exists.  We want to be sure to not overwrite any keys as api/auth tokens are generated using these values and will need to be regenerated if the underlying keys change.  

```bash
# Check if keys exists
if [ -f "keys/auth.pub" ] && [ -f "keys/auth.key" ]; then
  echo "Keys already exist. Skipping key generation." 
else
  echo "Keys not found. Generating keys..."
  cd keys 
  openssl genrsa -out auth.key 2048
  chmod 600 auth.key
  openssl rsa -in auth.key -pubout > auth.pub
  cd .. 
fi
```

Lastly we use this to specify that the last thing the container should do is run the command specified in the Dockerfile or in the compose's command block like this:

```bash
# Run the application
$*
```

This just says run whatever was last passed to this script.  In this case whatever docker was queuing up to run.  Which again you can find either in the specific container as the last command or in the docker compose like this:

```yml
    command: ["npm", "run", "dev"] 
```

## Networking

Containers can use the docker network address translation to change our references to the container name to the underlying IP address.  This makes us referencing other containers from within a container easier to read.  For instance in our .env.default for api we reference the rhythm server like this instead of using an IP:

```bash
WORKFLOW_SERVER_BASE_URL=http://rhythm:5001
```

For proxying containers to the localhost matching what we'd do in prod as much as possible we use vite from the UI container to route traffic to containers that are only exposed within the docker network, but not bound to the localhost:

```js
 proxy: {
        "/api": {
          target: env.VITE_API_REDIRECT_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/grafana": {
          target: env.VITE_GRAFANA_REDIRECT_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/grafana/, ""),
          // retrieve the grafana_token from cookie and set it as a header
          // X-JWT-Assertion
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              const grafana_token = req?.headers?.cookie
                ?.split("; ")
                ?.find((row) => row.startsWith("grafana_token"))
                ?.split("=")?.[1];
              if (!grafana_token) {
                return;
              }
              proxyReq.setHeader("X-JWT-Assertion", grafana_token);
              proxyReq.setHeader("X-Forwarded-Proto", "https");
            });
          },
        },
        "/upload": {
          target: env.VITE_UPLOAD_API_URL,
          changeOrigin: true,
          secure: false,
        },
      },
```










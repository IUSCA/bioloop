FROM node:19

ARG APP_GID
ARG APP_UID

# create scauser and sca group with the same ids as in the production VM.
RUN groupadd -o --gid ${APP_GID} sca
RUN useradd -ms /bin/bash --uid ${APP_UID} --gid ${APP_GID} scauser

WORKDIR /opt/sca/app
RUN chown -R scauser:sca /opt/sca/app

# execute below steps as
USER scauser:sca

# create node_modules directory before the external / docker volume mounts
# otherwise docker daemon will attempt to create this directory and it will be owned by root:root.
RUN mkdir /opt/sca/app/node_modules

# setup for installing npm global packages as non-root user
RUN npm config set prefix '/home/scauser/.local/'
RUN mkdir -p /home/scauser/.local/bin
ENV PATH="/home/scauser/.local/bin/:${PATH}"

# install pnpm and install packages from pnpm-lock.yaml
RUN npm install pm2 -g
# RUN npm install -g pnpm
#ENTRYPOINT npm ci && npx prisma db push && exec pm2-runtime ecosystem.config.js
ENTRYPOINT npm install && exec pm2-runtime ecosystem.config.js
# ENTRYPOINT pnpm fetch && npx prisma db push && exec /opt/sca/app/node_modules/.bin/nodemon --signal SIGTERM src/index.js

# Entrypoint will be run in the shell mode - https://docs.docker.com/engine/reference/builder/#shell-form-entrypoint-example
# any CMD or docker run command line arguments or commad in docker-compose are ignored
# use --entrypoint or entrypoint in docker-compose to override this.


# pnpm fetch
#   Inorder to make builds predictable, it is necessary to install packages using `npm ci` which uses frozen package-lock.json.
#   This file is generated automatically during `npm install` and I don't want to run npm install in the dev environment.
#   Having multiple repositories leading to increased disk usage. To address this, I employ pnpm to minimize disk usage, but unfortunately, there is no way to convert pnpm-lock.yaml to package-lock.json.

# install packages directly from package.json using npm - build is not deterministic
# ENTRYPOINT npm install && npx prisma db push && exec /opt/sca/app/node_modules/.bin/nodemon --signal SIGTERM index.js

# install packages directly from package-lock.json using npm. Make sure that the lock is up to date.
# ENTRYPOINT npm ci && npx prisma db push && exec /opt/sca/app/node_modules/.bin/nodemon --signal SIGTERM index.js


# npx prisma db push
# Pushes the schema to the database and generates the prisma client.


# exec /opt/sca/app/node_modules/.bin/nodemon --signal SIGTERM index.js
# exec - replaces the current process with the spawned process -
#      - This means /opt/sca/app/node_modules/.bin/nodemon will get the PID 1, and
#      - will be able to receive UNIX signals (SIGTERM) and perform gracious shutdown of the server.
#      - nodemon internally sends SIGTERM to the express server (index.js) which then waits for the existing connections to close before stopping the server.
#
# Both `npm run` and `npm exec` / `npx` do not pass UNIX signals. Therefore, nodemon should be called directly using the full path /opt/sca/app/node_modules/.bin/nodemon

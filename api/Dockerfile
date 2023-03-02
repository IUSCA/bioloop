FROM node:19

ARG APP_GID
ARG APP_UID 

# create scauser and sca group with the same ids as in the production VM.
RUN groupadd -o --gid ${APP_GID} sca
RUN useradd -ms /bin/bash --uid ${APP_UID} --gid ${APP_GID} scauser

WORKDIR /opt/sca/app
RUN chown -R scauser:sca /opt/sca/app

# set user
USER scauser:sca

# create node_modules directory before the volume mounts
RUN mkdir /opt/sca/app/node_modules
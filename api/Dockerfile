FROM node:19

ARG APP_GID
ARG APP_UID 

# create scauser and sca group with the same ids as in the production VM.
RUN groupadd -o --gid 1302 sca
RUN useradd -ms /bin/bash --uid 2457689 --gid 1302 scauser 

WORKDIR /opt/sca/app
RUN chown -R scauser:sca /opt/sca/app

# set user
USER scauser:sca

# install pnpm
# ENV NPM_CONFIG_PREFIX=/home/scauser/.npm-global
# ENV PATH=$PATH:/home/scauser/.npm-global/bin
# RUN npm install -g pnpm

# create node_modules directory before the volume mounts
RUN mkdir /opt/sca/app/node_modules
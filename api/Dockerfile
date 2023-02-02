FROM node:19

ARG GID
ARG UID 

# create scauser and sca group with the same ids as in the production VM.
RUN groupadd -o --gid ${GID} sca
RUN useradd -ms /bin/bash --uid ${UID} --gid ${GID} scauser 

WORKDIR /opt/sca/app
RUN chown -R scauser:sca /opt/sca/app

# set user
USER scauser:sca

# install pnpm
ENV NPM_CONFIG_PREFIX=/home/scauser/.npm-global
ENV PATH=$PATH:/home/scauser/.npm-global/bin
RUN npm install -g pnpm

# create node_modules directory before the volume mounts
RUN mkdir /opt/sca/app/node_modules
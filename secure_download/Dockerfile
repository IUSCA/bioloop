FROM node:19

# Use build arguments for UID and GID
ARG UID=1001
ARG GID=1001

# Create a non-privileged user
RUN groupadd -g $GID scauser
RUN useradd -m -u $UID -g $GID scauser

WORKDIR /opt/sca/app

COPY package*.json ./
RUN npm ci

COPY . /opt/sca/app


EXPOSE 3080

USER scauser
# Set the entrypoint
ENTRYPOINT ["bin/entrypoint.sh"]

# Default command to run
CMD ["npm", "run", "start"]


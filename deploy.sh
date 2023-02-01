#!/bin/bash
APP_USER='dgluser'
APP_GROUP='sca'

# echo APP_UID=$(id -u $APP_USER) > .env
# echo APP_GID=$(getent group $APP_GROUP | cut -d: -f3) >> .env



sudo docker compose -f "docker-compose-prod.yml" restart worker_api
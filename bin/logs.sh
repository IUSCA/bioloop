#!/bin/sh
sudo docker compose -f docker-compose-prod.yml logs -t -f $1 
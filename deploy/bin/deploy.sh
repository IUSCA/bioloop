#!/bin/bash

# Download the rhythm_api repository if it doesn't exist
if [ ! -d "rhythm_api" ]; then git clone https://github.com/IUSCA/rhythm_api.git; fi

# Generate keys if they don't exist
if [ ! -d "rhythm_api/keys/" ]
then
  cd rhythm_api/keys/
  ./genkeys.sh
  cd ../../
fi

# Download the signet repository if it doesn't exist
if [ ! -d "signet" ]; then git clone https://github.com/IUSCA/signet.git; fi

# Generate keys if they don't exist
if [ ! -d "signet/keys/" ]
then
  cd signet/keys/
  ./genkeys.sh
  cd ../../
fi

# Generate all the environment vars specified in .env.examples using gitlab environment vars values
bin/generate_env.sh deploy
bin/generate_rhythm_env.sh deploy
bin/generate_signet_env.sh deploy

# Change the domain with the one for this environment
sed -i 's/APP_DOMAIN/'"$APP_DOMAIN"'/g' nginx/conf/nginx.conf
nginx/bin/init-letsencrypt.sh
cd deploy/ 

# remove any existing containers/networks
docker compose down 
docker compose pull && docker compose up -d --force-recreate --remove-orphans

# Setup the appropriate token for communication with the workers and rhythm_api
sed -i '/^WORKFLOW_AUTH_TOKEN/d' api.env
echo "WORKFLOW_AUTH_TOKEN=$(docker compose exec rhythm python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> api.env
sed -i '/^APP_API_TOKEN/d' workers.env
echo "APP_API_TOKEN=$(docker compose exec api node src/scripts/issue_token.js svc_tasks)" >> workers.env

# Deploy the prisma migrations and seed the database
docker compose exec api npx prisma migrate deploy
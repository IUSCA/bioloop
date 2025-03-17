#!/bin/bash

# Download the rhythm_api repository if it doesn't exist
if [ ! -d "rhythm_api" ]; then git clone https://github.com/IUSCA/rhythm_api.git; fi

# Generate keys
cd rhythm_api/keys/
./genkeys.sh
cd ../../

# Copy the mongo folder to the appropriate location
cd rhythm_api/
cp -r mongo/* /opt/sca/mongo/
cd ../

# Download the signet repository if it doesn't exist
if [ ! -d "signet" ]; then git clone https://github.com/IUSCA/signet.git; fi

# Generate keys 
cd signet/keys/
./genkeys.sh
cd ../../


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
docker compose pull && docker compose up -d --force-recreate --remove-orphans --build


# Create the client for the download service
APP_download="${APP_DOMAIN%%.*}_download"
response=$(curl --silent --request POST \
  --url http://172.20.0.7:5050/create_client \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data client_name=$APP_download \
  --data scope=download_file\ upload_file \
  --data client_uri=$APP_DOMAIN \
  --data token_endpoint_auth_method=client_secret_basic \
  --data grant_type=client_credentials)

client_id=$(echo $response | jq -r '.client_id')
client_secret=$(echo $response | jq -r '.client_secret')

# echo "Client ID: $client_id"
# echo "Client Secret: $client_secret"

sed -i '/^OAUTH_DOWNLOAD_CLIENT_ID/d' api.env
echo "OAUTH_DOWNLOAD_CLIENT_ID=$client_id" >> api.env

sed -i '/^OAUTH_DOWNLOAD_CLIENT_SECRET/d' api.env
echo "OAUTH_DOWNLOAD_CLIENT_SECRET=$client_secret" >> api.env

sed -i '/^OAUTH_UPLOAD_CLIENT_ID/d' api.env
echo "OAUTH_UPLOAD_CLIENT_ID=$client_id" >> api.env

sed -i '/^OAUTH_UPLOAD_CLIENT_SECRET/d' api.env
echo "OAUTH_UPLOAD_CLIENT_SECRET=$client_secret" >> api.env

# Setup the appropriate seed data for mongo 
if [ $(docker compose exec mongo mongo -u root -p example --authenticationDatabase admin celery --quiet --eval "db.getCollectionNames()" | grep -o -E "celery_taskmeta|workflow_meta" | wc -l) -eq 2 ]; then
  echo "Mongo already has data. Not importing seed data..."
else

  # only do this if the database is empty
  docker compose exec mongo mongoimport --uri 'mongodb://root:example@localhost:27017/?authSource=admin' --jsonArray --db celery --collection celery_taskmeta --file /opt/sca/app/mongodump/celery_taskmeta.json
  docker compose exec mongo mongoimport --uri 'mongodb://root:example@localhost:27017/?authSource=admin' --jsonArray --db celery --collection workflow_meta --file /opt/sca/app/mongodump/workflow_meta.json
  
fi


# Setup the auth token for the workflow service
sed -i '/^WORKFLOW_AUTH_TOKEN/d' api.env
echo "WORKFLOW_AUTH_TOKEN=$(docker compose exec rhythm python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> api.env


# Setup connection to the api from the workers container
sed -i '/^APP_API_TOKEN/d' workers.env
echo "APP_API_TOKEN=$(docker compose exec api node src/scripts/issue_token.js svc_tasks)" >> workers.env


# stop the services so that the new environment vars can be loaded
docker compose down

# Start the services
docker compose up -d

# Deploy the prisma migrations and seed the database
docker compose exec api npx prisma migrate deploy
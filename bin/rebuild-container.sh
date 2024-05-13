#!/bin/bash

# This script is used to rebuild the containers and push them to the registry

echo "Building the API container..."
cd api/
docker build -t git.sca.iu.edu:5050/iusca/bioloop/api:test .
docker push git.sca.iu.edu:5050/iusca/bioloop/api:test

echo "Building the UI container..."
cd ../ui/
docker build -t git.sca.iu.edu:5050/iusca/bioloop/ui:test .
docker push git.sca.iu.edu:5050/iusca/bioloop/ui:test

echo "Building the nginx container..."
cd ../nginx/
docker build -t git.sca.iu.edu:5050/iusca/bioloop/nginx:test .
docker push git.sca.iu.edu:5050/iusca/bioloop/nginx:test

cd ..
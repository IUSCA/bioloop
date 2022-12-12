#!/bin/bash

## Deployment Configuration ##
app_folder='/opt/sca/dgl-test/'

echo "Deploying DB..."
cd ${app_folder}api

## Use local (as in project node_modules/)
npm install node npx

echo "Creating DB Schema..."
$(npm bin)/npx prisma db push

echo "Seeding DB..."
$(npm bin)/npx prisma db seed 
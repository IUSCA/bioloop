#!/bin/bash

## Deployment Configuration ##
app_folder='/opt/sca/gpdb-test/'
api_config_dir="${HOME}/config/api/"
ui_config_dir="${HOME}/config/ui/"
worker_config_dir="${HOME}/config/worker/"

echo "Deploying UI..."
cd ${app_folder}ui
cp ${ui_config_dir}config.js src/
npm install
npm run build

echo "Deploying api..."
cd ${app_folder}api
cp ${api_config_dir}index.js config/
if [ ! -f "config/auth.key" ]; then
    echo "Generating fresh key..."
    cd config
    ./genkey.sh
    cd ..
fi
rm package-lock.json
npm install
npm install npm node@14


echo "Update DB Schema and create client..."
$(npm bin)/npx prisma db push






echo "Running PM2 for api and worker..."
cd ${app_folder}
pm2 start pm2.yml

echo "Now run PM2 save if you're happy..."
#!/bin/bash

## Deployment Configuration ##
app_folder='/opt/sca/gpdb/'
config_folder="${HOME}/config/"


echo "Deploying UI..."
cd ${app_folder}ui
cp ${config_folder}ui/config.js src/
npm install
npm run build

echo "Deploying api..."
cd ${app_folder}api
cp ${config_folder}api/.env .
cp ${config_folder}api/default.json config/
if [ ! -f "config/auth.key" ]; then
    echo "Generating fresh key..."
    cd config
    ./genkey.sh
    cd ..
fi
npm install

echo "Update DB Schema and create client..."
npx prisma db push

# echo "Deploying worker..."
# cd ${app_folder}worker
# cp ${worker_config_dir}config.ini .

# echo "Install python dependencies..."
# cd ${HOME}
# python3 -m venv venv
# cd venv/
# source bin/activate
# pip install pika

echo "Running PM2 for api and worker..."
cd ${app_folder}
cp ${config_folder}pm2.prod.yml .
pm2 start pm2.prod.yml

echo "Now run PM2 save if you're happy..."
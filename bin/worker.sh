#!/bin/bash

echo "Generate python venv..."
cd worker/
python3 -m venv venv
cd venv/
source bin/activate
cd ..

echo "Install project requirements..."
pip install -r requirements.txt

echo "Start pm2 process for workers..."
pm2 start pm2.worker.yml --time
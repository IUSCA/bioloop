module load python/3.10.5

python -m celery -A scaworkers.celery_app worker --concurrency 8

pm2 start ecosystem.config.js
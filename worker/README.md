# Workers

## Celery Workers

Add `module load python/3.10.5` to ~/.modules


```bash
cd /opt/sca/dgl/worker
pm2 start ecosystem.config.js
```

```bash
python -m celery -A scaworkers.celery_app worker --concurrency 8
```

## Worker API


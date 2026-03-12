# Upload Rewrite — Pre-Deployment Checklist

Branch: `uploads-rewrite---pr-feedback`
Migration: `20260311000000_upload_rewrite`

---

## 1. Database Migration

Run inside the app container.  If a previous failed attempt left the migration
marked as failed in `_prisma_migrations`, resolve it first:

```bash
# Only needed if a prior deploy attempt failed mid-migration
npx prisma migrate resolve --rolled-back 20260311000000_upload_rewrite

# Apply the migration
npx prisma migrate deploy
```

**What the migration does:**
- Moves `create_method` from `dataset_audit` → `dataset`
- Rebuilds the `upload_status` enum (adds `VERIFYING`, `VERIFIED`,
  `VERIFICATION_FAILED`, `PERMANENTLY_FAILED`; removes unused `FAILED`)
- Restructures `dataset_upload_log`: replaces the `audit_log_id` indirection
  with a direct `dataset_id` FK; adds `process_id`, `retry_count`, `metadata`

---

## 2. Environment Variable — API Host

Set in `/opt/sca/bioloop/api/.env` on the API host before restarting the
container:

```
UPLOAD_HOST_DIR=/N/scratch/scadev/bioloop/dev/uploads
```

The compose file mounts this path into the container at the same location
(`${UPLOAD_HOST_DIR}:${UPLOAD_HOST_DIR}`) and injects the variable into the
container environment, so the path is identical inside and outside the
container.

The directory must exist on the host before `docker compose up` or the bind
mount will fail.  `setup_dirs.py --create` (step 4) handles this.

---

## 3. Worker — Dependencies

The workers gained one new runtime dependency (`blake3`) and the `verify_upload`
Celery task.  Install the updated package on each worker host:

```bash
cd /path/to/workers
pip install -e .
# or, if using poetry:
poetry install
```

Verify `blake3` is importable:

```bash
python -c "import blake3; print('blake3 ok')"
```

---

## 4. Worker — Directory Setup

Run `setup_dirs.py` on each worker host to create the upload directory and
verify all other expected paths exist:

```bash
# Dry run — prints Exists/Missing for each configured path
python -m workers.scripts.setup_dirs

# Actually create missing directories
python -m workers.scripts.setup_dirs --create
```

`paths.upload` (`/N/scratch/scadev/bioloop/dev/uploads`) is now included in
the checked/created set.  This single directory serves as the base for all
upload types (`raw_data` and `data_product` are subdirectories within it).

---

## 5. API — npm install / deploy

```bash
# On the API host (or in the container build context)
cd /opt/sca/bioloop/api
npm install          # regenerates package-lock.json with @tus/* and ioredis
git add package-lock.json
git commit -m "chore(api): update package-lock for tus and ioredis"

# Then redeploy
bin/deploy.sh
```

---

## 6. PM2 — Register `manage_upload_workflows` Cron

`manage_upload_workflows.py` must run every minute on the worker host to drive
the `UPLOADED → VERIFYING → VERIFIED → (integrated workflow)` state machine.
Add it to the PM2 ecosystem file if not already present:

```js
{
  name: 'manage_upload_workflows',
  script: 'python',
  args: '-m workers.scripts.manage_upload_workflows --dry-run=False',
  cron_restart: '* * * * *',
  autorestart: false,
}
```

Then reload PM2:

```bash
pm2 reload ecosystem.config.js
pm2 save
```

---

## Post-Deploy Smoke Test

1. Log in to the UI and initiate a small test upload.
2. Confirm the upload log row appears in the DB:
   ```sql
   SELECT id, dataset_id, status, process_id, retry_count, metadata
   FROM dataset_upload_log ORDER BY id DESC LIMIT 5;
   ```
3. After TUS finishes, status should transition:
   `UPLOADING → UPLOADED → VERIFYING → VERIFIED → COMPLETE`
4. Confirm the file lands at `origin_path` under
   `/N/scratch/scadev/bioloop/dev/uploads/`.
5. Confirm the integrated workflow starts (check `/workflows` in the UI).

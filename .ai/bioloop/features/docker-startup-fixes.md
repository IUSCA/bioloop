# Docker Startup & Integration Test Fixes

**Status:** Completed  
**Last Updated:** 2026-03-15

---

## Background

The docker-mode startup sequence relies on entrypoint scripts to generate and exchange credentials between containers (`WORKFLOW_AUTH_TOKEN`, `APP_API_TOKEN`, OAuth client secrets). A chain of compounding bugs made this process fragile and non-deterministic, causing the API to randomly fail when calling the Rhythm workflow API (`500 Internal Server Error`). Additionally, the newly-ported `watch.py` integration tests consistently failed due to misconfigured timeouts and a missing API field.

---

## Fixes Applied

### Fix 1 — rhythm volume mount: wrong path (`docker-compose.yml`)

**Symptom:** API returns 500 when calling Rhythm API. Intermittent across container restarts.

**Root cause:** The docker-compose.yml mounted `./rhythm/keys` at `/opt/sca/keys`, but the rhythm image generates and reads its RSA signing keys at `/app/keys`. The host-side `rhythm/keys/` directory was always empty because rhythm never wrote to `/opt/sca/keys`. Keys were ephemeral (lived only in the container overlay), lost on every container restart. On restart, rhythm generated new keys but could not update the `WORKFLOW_AUTH_TOKEN` in `api/.env`, so the API used a stale token signed by keys that no longer existed.

**Fix:** Changed volume mount to a named Docker volume at the correct path:
```yaml
# Before
- ./rhythm/keys:/opt/sca/keys
# After
- rhythm_keys:/app/keys
```
Added `rhythm_keys` to the named volumes section. Named volumes persist across `docker compose down` (but not `down -v`), keeping keys stable across normal restarts.

---

### Fix 2 — `sed -i` fails on macOS virtiofs bind mounts (`rhythm/bin/entrypoint.sh`, `api/bin/entrypoint.sh`)

**Symptom:** On the first container start, rhythm's entrypoint failed with `sed: couldn't open temporary file /app/api/sedureEaP: Permission denied`. A stale `sedureEaP` temp file was left in the `api/` directory. Rhythm restarted (due to `restart: unless-stopped`), found existing keys + old token, skipped regeneration, and started with a mismatched token → 401 from Rhythm → 500 from API.

**Root cause:** `sed -i` (GNU sed) creates a temp file in the **same directory** as the file being edited before doing an atomic rename. On macOS Docker Desktop with virtiofs bind mounts, creating new files in the `./api/` bind-mount directory fails with Permission Denied from inside the container — even as root — due to ACL/virtiofs quirks. The fix avoids the atomic rename by writing to `/tmp` first, then using `cat >` to overwrite the existing file in-place (requires only file write permission, not directory permission).

**Fix in `rhythm/bin/entrypoint.sh`** — both token-clearing blocks:
```bash
# Before
sed -i '/^WORKFLOW_AUTH_TOKEN/d' "$api_env"
# After
grep -v "^WORKFLOW_AUTH_TOKEN" "$api_env" > /tmp/_env_tmp && cat /tmp/_env_tmp > "$api_env" && rm /tmp/_env_tmp
```

**Fix in `api/bin/entrypoint.sh`** — OAuth credentials block (4 `sed -i` calls consolidated):
```bash
# Before (4 separate sed -i calls)
sed -i '/^OAUTH_DOWNLOAD_CLIENT_ID/d' .env
sed -i '/^OAUTH_DOWNLOAD_CLIENT_SECRET/d' .env
sed -i '/^OAUTH_UPLOAD_CLIENT_ID/d' .env
sed -i '/^OAUTH_UPLOAD_CLIENT_SECRET/d' .env
# After (single grep -v, then append)
grep -v "^OAUTH_DOWNLOAD_CLIENT_ID\|^OAUTH_DOWNLOAD_CLIENT_SECRET\|^OAUTH_UPLOAD_CLIENT_ID\|^OAUTH_UPLOAD_CLIENT_SECRET" .env > /tmp/_env_tmp && cat /tmp/_env_tmp > .env && rm /tmp/_env_tmp
```

---

### Fix 3 — KEYS_GENERATED coupling in rhythm entrypoint (`rhythm/bin/entrypoint.sh`)

**Symptom:** After a volume-clearing restart, rhythm generated new keys but kept the old (now-invalid) token.

**Root cause:** The original entrypoint only checked "does a token exist?" — it did not check whether the token was signed by the *current* keys.

**Fix:** Added `KEYS_GENERATED` flag. Token regeneration is forced whenever keys were just generated (first start, or after `docker compose down -v`). If keys already exist (normal restart), the existing token is assumed valid.

---

### Fix 4 — stale `celery_worker.pid` across container recreations (`workers/bin/entrypoint.sh`)

**Symptom:** After `--force-recreate celery_worker`, the container immediately exited with `ERROR: Pidfile (celery_worker.pid) already exists.`

**Root cause:** `./workers/` is bind-mounted, so `celery_worker.pid` written by the previous celery process persists on the host. On the next container start, celery refuses to start.

**Fix:** Added `rm -f celery_worker.pid` in the entrypoint before starting celery:
```bash
if [ $WORKER_TYPE == "celery_worker" ]; then
  rm -f celery_worker.pid
  exec python -m celery ...
```

---

### Fix 5 — `wait_between_stability_checks_seconds` not overridden for docker dev (`workers/config/docker.py`)

**Symptom:** `test_integrated_workflow_steps_all_succeed` froze at `0/6 steps done` for 5+ minutes. The `await_stability` celery task received the correct `recency_threshold=5s` override but slept **300 seconds** between stability checks.

**Root cause:** `docker.py` overrides `recency_threshold_seconds: 5` but did NOT override `wait_between_stability_checks_seconds`. The fallback from `common.py` is `FIVE_MINUTES = 300`. So `await_stability` would check, find the directory 1s old (below 5s threshold), then sleep 300 seconds before checking again.

**Fix:**
```python
# workers/workers/config/docker.py
'wait_between_stability_checks_seconds': 5,  # poll frequently in docker dev
```

---

### Fix 6 — `create_method` not returned by `get_dataset()` (`workers/workers/api.py`, `workers/tests/watch/conftest.py`)

**Symptom:** `test_observer_detects_new_directory_and_creates_dataset` raised `KeyError: 'create_method'`.

**Root cause:** `create_method` is stored in the `dataset_audit` table (Prisma model `dataset_audit`), not directly on the `dataset` table. The `GET /datasets/{id}` endpoint only includes audit logs when `include_audit_logs=True` is passed. The `get_dataset()` helper in `workers/api.py` did not expose this parameter.

**Fix — `workers/workers/api.py`:** Added `include_audit_logs` parameter and automatic flattening:
```python
def get_dataset(
    dataset_id: str,
    files: bool = False,
    bundle: bool = False,
    workflows: bool = False,
    include_audit_logs: bool = False,
):
    # ...
    if include_audit_logs:
        create_entry = next(
            (log for log in (dataset.get('audit_logs') or []) if log.get('action') == 'create'),
            None,
        )
        if create_entry:
            dataset['create_method'] = create_entry.get('create_method')
```

**Fix — `workers/tests/watch/conftest.py`:** Updated `registered_dataset` fixture to pass `include_audit_logs=True`:
```python
dataset = api.get_dataset(
    dataset_id=matches[0]['id'],
    workflows=True,
    include_audit_logs=True,
)
```

---

## Clean-Slate Procedure

To do a full fresh restart (e.g., after schema changes, broken credentials, or for CI):

```bash
# 1. Stop all containers and remove named volumes (rhythm_keys, queue_volume, etc.)
docker compose down -v

# 2. Clear bind-mount-persisted generated state
rm -f api/.env workers/.env
rm -f api/keys/auth.key api/keys/auth.pub
rm -rf db/postgres/data/* db/mongo/data/*

# 3. Bring back up — entrypoints regenerate all credentials automatically
docker compose up -d
```

`docker compose down -v` alone is NOT sufficient because `api/.env`, `workers/.env`, and `api/keys/` are bind-mounted (host directories), not named volumes.

---

## Integration Test Results (post-fix)

All 8 tests pass in ~23 seconds:

```
tests/watch/test_watch_registration.py::TestWatchRegistration::test_observer_detects_new_directory_and_creates_dataset[RAW_DATA] PASSED
tests/watch/test_watch_registration.py::TestWatchRegistration::test_observer_detects_new_directory_and_creates_dataset[DATA_PRODUCT] PASSED
tests/watch/test_watch_registration.py::TestWatchRegistration::test_observer_detects_new_directory_and_triggers_integrated_workflow[RAW_DATA] PASSED
tests/watch/test_watch_registration.py::TestWatchRegistration::test_observer_detects_new_directory_and_triggers_integrated_workflow[DATA_PRODUCT] PASSED
tests/watch/test_watch_registration.py::TestWatchRegistration::test_integrated_workflow_steps_all_succeed[RAW_DATA] PASSED
tests/watch/test_watch_registration.py::TestWatchRegistration::test_integrated_workflow_steps_all_succeed[DATA_PRODUCT] PASSED
tests/watch/test_watch_registration.py::TestWatchRegistration::test_observer_does_not_register_same_directory_twice[RAW_DATA] PASSED
tests/watch/test_watch_registration.py::TestWatchRegistration::test_observer_does_not_register_same_directory_twice[DATA_PRODUCT] PASSED

======================== 8 passed, 1 warning in 22.96s =========================
```

---

## Pending

- **Startup performance audit** (todo `startup-perf`): Add timestamps to all entrypoint scripts and identify bottlenecks (npm install, prisma generate/migrate, wait loops).

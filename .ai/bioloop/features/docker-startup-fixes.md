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

---

## Startup Performance Optimisations

**Status:** Completed  
**Measured improvement:** ~101s → ~44s cold start; warm restart of api/ui/secure_download drops from ~42s total to ~1s total.

---

### Opt 1 — Exhaustive timing added to all entrypoint scripts

**Why:** There was no visibility into which step within an entrypoint was consuming time. The only signal was the overall container `healthy` timestamp in `docker compose up` output, which conflates wait time, npm install, migrations, and credential generation.

**What was added:** A `ts()` helper function at the top of every entrypoint script (`api`, `rhythm`, `signet`, `ui`, `secure_download`, `workers`) that prints `[HH:MM:SS +Xs elapsed]` before every significant operation, and a per-step `_T=$(date +%s)` / `done (Xs)` pair around each timed block. Polling loops print the current timestamp on every iteration.

**Effect:** Logs now show exactly how long each step takes, making future regressions immediately obvious.

---

### Opt 2 — `node_modules` cached in Docker named volumes (`docker-compose.yml`, entrypoints)

**Why:** `api`, `ui`, and `secure_download` each run `npm install` inside a bind-mounted working directory on every container start. Because `node_modules` is part of the bind-mounted host directory, it is not shared with any Docker layer cache and must be fully reinstalled even when `package-lock.json` hasn't changed. On a warm restart this was pure waste: api 10s, ui 15s, secure_download 6s = **31s** wasted on every restart.

**Fix:** Added three named volumes (`api_node_modules`, `ui_node_modules`, `secure_download_node_modules`) mounted over the respective `node_modules` paths inside each container. Named volumes are managed by Docker and persist across `docker compose down` (cleared only by `bin/docker-reset.sh` or `docker compose down -v`).

**Hash-check guard:** A lockfile hash check was added to each entrypoint before running `npm install`. The MD5 of `package-lock.json` is written to `node_modules/.install_hash` after a successful install. On the next start, if the hash matches, `npm install` is skipped entirely. If `package-lock.json` changes (e.g., a developer adds a package), the hash mismatches and `npm install` runs normally.

**Result:** On warm restart — api entrypoint completes in **1s** (was 18s), ui in **0s** (was 18s), secure_download in **0s** (was 6s).

---

### Opt 3 — `prisma generate` cached behind schema hash check (`api/bin/entrypoint.sh`)

**Why:** `prisma generate` rewrites the Prisma client into `node_modules/@prisma/client` on every start, taking ~2s even when `prisma/schema.prisma` hasn't changed.

**Fix:** Same hash-check pattern as `npm install`. MD5 of `prisma/schema.prisma` is written to `node_modules/.prisma_generate_hash` after a successful `prisma generate`. On subsequent starts, if the schema hash matches, generation is skipped. Because `node_modules` is now a named volume, this hash persists across restarts.

**Result:** `prisma generate` is skipped on every warm restart unless the Prisma schema file is modified.

---

### Opt 4 — `prisma db seed` skipped on warm restarts via marker file (`api/bin/entrypoint.sh`)

**Why:** The seed script runs unconditionally on every start. Most of its work is idempotent (`upsert`), but it also runs `deleteMany` + `createMany` for metrics, data access logs, staged logs, stage request logs, and instruments — regenerating ~1 year of fake analytics data every time. This takes ~4s and produces no meaningful change on a warm restart.

**Fix:** After a successful seed run, the entrypoint writes `api/.db_seeded` (a zero-byte marker file in the bind-mounted `api/` directory). On subsequent starts, if the marker exists, the seed is skipped. `bin/docker-reset.sh` removes this file alongside the database data so that a Docker environment reset triggers a full re-seed.

`api/.db_seeded` is added to `.gitignore`.

**Result:** Seed step is skipped on every warm restart.

---

### Opt 5 — Health check intervals reduced from 30s to 5s (`docker-compose.yml`)

**Why:** Docker's `depends_on: condition: service_healthy` blocks a dependent service from starting until the dependency's health check passes. With a 30s health check interval, the first check does not fire until 30s after the service starts — even if the service became healthy in 2s. This was the largest single bottleneck on the critical path: `signet` (on which `api` depends) was healthy after ~2s but the API container didn't start for another ~28s.

**Fix:** Changed `interval: 30s` to `interval: 5s` and `retries: 5` to `retries: 10` on all health-checked services (`api`, `rhythm`, `signet`, `signet_db`, `secure_download`). Added `start_period` per service to give each one a grace period before failures count toward the retry limit, avoiding false unhealthy marks during slow cold starts.

| Service | `start_period` | Rationale |
|---|---|---|
| `signet_db` | 5s | postgres starts in <2s |
| `signet` | 10s | depends on signet_db |
| `rhythm` | 15s | Python ASGI, RSA key gen on cold start |
| `secure_download` | 15s | npm install on cold start |
| `api` | 30s | npm + prisma + seed on cold start |

**Result:** ~25s shaved off the `signet → api` dependency wait on cold starts.

---

### Opt 6 — TLS cert key size reduced from rsa:4096 to rsa:2048 (`ui/bin/entrypoint.sh`)

**Why:** The UI entrypoint generates a self-signed TLS certificate on cold start using `openssl req -newkey rsa:4096`. 4096-bit key generation is significantly slower than 2048-bit, and there is no security reason to use 4096-bit for a local development certificate.

**Fix:** Changed `-newkey rsa:4096` to `-newkey rsa:2048`. The cert is self-signed and only used for the local dev Nuxt server on port 443.

**Result:** TLS cert generation drops from ~3s to <1s on cold start.

---

## Docker Environment Reset Procedure

Use the script — it handles all steps safely and without `sudo`:

```bash
bin/docker-reset.sh              # interactive (prompts before each step)
bin/docker-reset.sh --no-confirm # non-interactive
```

See `.ai/bioloop/docker-reset.md` for a step-by-step breakdown of what the script removes and why.

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

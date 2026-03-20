# Docker Startup & Connectivity Fixes — Porting Guide

This document lists every change required to make the Docker development environment
start up cleanly and have all services connect to one another. It is written for an
agent porting these fixes into a fresh clone of the IUSCA/bioloop repository.

Test-only changes are deliberately excluded.

---

## 1. `docker-compose.yml`

### 1a. Rhythm volume mount — wrong container path

**Problem:** The original mount was `./rhythm/keys:/opt/sca/keys`, but the rhythm
image generates and reads its RSA signing keys at `/app/keys`. The host directory
`rhythm/keys/` was always empty — rhythm never wrote there. Keys lived only in the
container overlay and were lost on every restart. On the next start, rhythm generated
new keys but the stale `WORKFLOW_AUTH_TOKEN` in `api/.env` no longer matched, causing
`401 Unauthorized` from rhythm → `500 Internal Server Error` from the API.

**Fix:** Replace the bind-mount with a named volume at the correct path, and declare
the volume:

```yaml
# services.rhythm.volumes — before
- ./rhythm/keys:/opt/sca/keys

# services.rhythm.volumes — after
- rhythm_keys:/app/keys

# top-level volumes section — add
volumes:
  rhythm_keys:
```

---

### 1b. Named volumes for `node_modules`

**Problem:** `api`, `ui`, and `secure_download` all run `npm install` inside their
bind-mounted working directories. Because `node_modules/` is part of the bind-mount,
Docker has no layer cache for it. On macOS Docker Desktop, the cross-OS FS layer also
means `node_modules/.bin` executables can disappear after `docker compose down`, causing
`sh: 1: vite: not found` (or the equivalent for the other services) on the next start.

**Fix:** Mount named volumes over each `node_modules` directory so Docker owns and
persists them independently of the host bind-mount:

```yaml
# services.api.volumes — add
- api_node_modules:/opt/sca/app/node_modules

# services.ui.volumes — add
- ui_node_modules:/app/node_modules

# services.secure_download.volumes — add
- secure_download_node_modules:/opt/sca/app/node_modules

# top-level volumes section — add
volumes:
  api_node_modules:
  ui_node_modules:
  secure_download_node_modules:
```

---

### 1c. Health check `interval` / `start_period`

**Problem:** All health checks used `interval: 30s`. Because
`depends_on: condition: service_healthy` blocks a dependent service until the health
check passes, a service that became healthy after 2 s still forced its dependents to
wait the full 30 s interval before the first check fired. This added ~25 s of dead
wait on the `signet → api` chain alone.

**Fix:** Reduce interval to `5s`, increase `retries` to `10`, and add
per-service `start_period` grace periods:

```yaml
services:
  signet_db:
    healthcheck:
      interval: 5s
      retries: 10
      start_period: 5s

  signet:
    healthcheck:
      interval: 5s
      retries: 10
      start_period: 10s

  rhythm:
    healthcheck:
      interval: 5s
      retries: 10
      start_period: 15s   # RSA key gen on cold start

  secure_download:
    healthcheck:
      interval: 5s
      retries: 10
      start_period: 15s   # npm install on cold start

  api:
    healthcheck:
      interval: 5s
      retries: 10
      start_period: 30s   # npm + prisma + seed on cold start
```

---

## 2. `rhythm/bin/entrypoint.sh`

### 2a. Replace `sed -i` with `grep -v | cat`

**Problem:** GNU `sed -i` creates a temp file in the **same directory** as the target
before doing an atomic rename. On macOS Docker Desktop with virtiofs bind-mounts,
creating new files inside `./api/` from inside the container fails with
`Permission denied` — even as root — due to virtiofs ACL quirks. This left a stale
`sedXXXXXX` temp file in the repo and caused the `WORKFLOW_AUTH_TOKEN` write to fail.

**Fix:** Replace every `sed -i '/^WORKFLOW_AUTH_TOKEN/d' "$api_env"` with:

```bash
grep -v "^WORKFLOW_AUTH_TOKEN" "$api_env" > /tmp/_env_tmp \
  && cat /tmp/_env_tmp > "$api_env" \
  && rm /tmp/_env_tmp
```

`cat >` overwrites the existing inode in-place (requires only file write permission,
not directory write permission), bypassing the virtiofs restriction.

---

### 2b. `KEYS_GENERATED` coupling flag

**Problem:** The original entrypoint checked "does a token already exist?" in
`api/.env` — but if the named volume was cleared (e.g., `docker compose down -v`) and
rhythm regenerated keys, the old token in `api/.env` was still present and not
overwritten. The API then started with a valid-looking but key-mismatched token,
causing `401` errors that were hard to trace.

**Fix:** Track whether keys were just generated in the current entrypoint run:

```bash
KEYS_GENERATED=false
if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then
  echo "RSA keys already exist. Skipping generation."
else
  cd keys/ && ./genkeys.sh && cd ../
  KEYS_GENERATED=true
fi

# When deciding whether to regenerate the token:
if [ "$KEYS_GENERATED" = "false" ] && grep -q "^WORKFLOW_AUTH_TOKEN=" "$api_env"; then
  # Keys and token are in sync — skip regeneration.
  :
else
  # Keys were just generated (or token is absent) — issue a fresh token.
  grep -v "^WORKFLOW_AUTH_TOKEN" "$api_env" > /tmp/_env_tmp \
    && cat /tmp/_env_tmp > "$api_env" \
    && rm /tmp/_env_tmp
  echo "WORKFLOW_AUTH_TOKEN=$(python -m rhythm_api.scripts.issue_token --sub bioloop-dev.sca.iu.edu)" >> "$api_env"
fi
```

---

## 3. `api/bin/entrypoint.sh`

### 3a. Replace `sed -i` with `grep -v | cat` for OAuth credentials

**Problem:** Same virtiofs bind-mount `sed -i` failure as Fix 2a, applied to the four
OAuth credential lines written to `api/.env`:

```bash
# Before (four separate sed -i calls, each fails on macOS virtiofs)
sed -i '/^OAUTH_DOWNLOAD_CLIENT_ID/d' .env
sed -i '/^OAUTH_DOWNLOAD_CLIENT_SECRET/d' .env
sed -i '/^OAUTH_UPLOAD_CLIENT_ID/d' .env
sed -i '/^OAUTH_UPLOAD_CLIENT_SECRET/d' .env
```

**Fix:** Single pass with `grep -v`:

```bash
grep -v "^OAUTH_DOWNLOAD_CLIENT_ID\|^OAUTH_DOWNLOAD_CLIENT_SECRET\|^OAUTH_UPLOAD_CLIENT_ID\|^OAUTH_UPLOAD_CLIENT_SECRET" \
  .env > /tmp/_env_tmp && cat /tmp/_env_tmp > .env && rm /tmp/_env_tmp
# then append the four new values as before
```

---

### 3b. `npm install` — lockfile hash guard + `.bin` existence check

**Problem:** Without named volumes (see Fix 1b), `node_modules/.bin` could be missing
even when `package-lock.json` had not changed, causing startup failures.

**Fix:** Before running `npm install`, check both the lockfile hash and that
`node_modules/.bin` exists and is non-empty. Only skip `npm install` if both
conditions hold:

```bash
LOCK_HASH=$(md5sum package-lock.json | awk '{print $1}')
STORED_HASH=$(cat node_modules/.install_hash 2>/dev/null || echo "")
BIN_POPULATED=$(ls node_modules/.bin 2>/dev/null | wc -l)

if [ "$LOCK_HASH" = "$STORED_HASH" ] && [ "$BIN_POPULATED" -gt 0 ]; then
  echo "node_modules up to date — skipping npm install"
else
  npm install
  echo "$LOCK_HASH" > node_modules/.install_hash
fi
```

Apply the same pattern in `ui/bin/entrypoint.sh` and
`secure_download/bin/entrypoint.sh`.

---

### 3c. `prisma generate` — schema hash guard

**Problem:** `npx prisma generate` rewrites the entire Prisma client on every start
(~2 s), even when `prisma/schema.prisma` hasn't changed.

**Fix:**

```bash
SCHEMA_HASH=$(md5sum prisma/schema.prisma | awk '{print $1}')
STORED_SCHEMA_HASH=$(cat node_modules/.prisma_generate_hash 2>/dev/null || echo "")

if [ "$SCHEMA_HASH" = "$STORED_SCHEMA_HASH" ]; then
  echo "Prisma schema unchanged — skipping prisma generate"
else
  npx prisma generate
  echo "$SCHEMA_HASH" > node_modules/.prisma_generate_hash
fi
```

---

### 3d. `prisma db seed` — `.db_seeded` marker file

**Problem:** The seed script runs on every start, regenerating ~1 year of fake
analytics data even on warm restarts (~4 s wasted each time).

**Fix:** Write a zero-byte marker file after the first successful seed, and skip on
subsequent starts:

```bash
if [ -f ".db_seeded" ]; then
  echo "DB already seeded — skipping"
else
  npx prisma db seed && touch .db_seeded
fi
```

Add `api/.db_seeded` to `.gitignore`.

`bin/docker-reset.sh` must remove this file so a full environment reset triggers a
re-seed.

---

## 4. `workers/bin/entrypoint.sh`

### 4a. Remove stale Celery PID file on startup

**Problem:** `./workers/` is bind-mounted, so `celery_worker.pid` written by a
previous celery process persists on the host after the container is removed. On the
next `docker compose up`, celery refuses to start with
`ERROR: Pidfile (celery_worker.pid) already exists.`

**Fix:** Remove the PID file before starting celery:

```bash
if [ $WORKER_TYPE == "celery_worker" ]; then
  rm -f celery_worker.pid
  exec python -m celery -A workers.celery_app worker ...
fi
```

---

## 5. `ui/bin/entrypoint.sh`

### 5a. TLS cert key size: `rsa:4096` → `rsa:2048`

**Problem:** The UI entrypoint generates a self-signed TLS cert with
`openssl req -newkey rsa:4096`. On ARM (Apple Silicon) hosts under QEMU emulation,
4096-bit key generation takes ~3–5 s compared to <1 s for 2048-bit. There is no
security justification for 4096-bit in a local development cert.

**Fix:**

```bash
# Before
openssl req -x509 -newkey rsa:4096 ...
# After
openssl req -x509 -newkey rsa:2048 ...
```

---

## 6. `workers/workers/config/docker.py`

### 6a. `wait_between_stability_checks_seconds` not overridden

**Problem:** The `docker.py` config override set `recency_threshold_seconds: 5` for
fast-turnaround dev, but did **not** override `wait_between_stability_checks_seconds`.
The fallback from `common.py` is `FIVE_MINUTES = 300`. The `await_stability` Celery
task therefore slept 300 s between each stability check even though the threshold was
only 5 s — effectively stalling the entire integrated workflow for ~5 minutes.

**Fix:** Add to the `registration` section:

```python
'registration': {
    ...
    'wait_between_stability_checks_seconds': 5,
    ...
}
```

---

## 7. `workers/workers/tasks/delete.py`

### 7a. `hsi` (HPSS client) not available in Docker dev mode

**Problem:** The `delete_dataset` task unconditionally called `sda.delete(sda_path)`,
which shells out to the `hsi` binary (the HPSS/SDA client). `hsi` is not installed in
the Docker dev image, so every delete workflow failed with:

```
FileNotFoundError: [Errno 2] No such file or directory: 'hsi'
```

**Fix:** Guard on `app_env`:

```python
from workers.config import app_env

def delete_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)
    sda_path = dataset['archive_path']

    if app_env == 'docker':
        # No HPSS/SDA in Docker — delete the locally-archived file directly.
        if sda_path:
            archive_file = Path(sda_path)
            if archive_file.exists():
                archive_file.unlink()
    else:
        sda.delete(sda_path)

    update_data = {
        'archive_path': None,
        'is_deleted': True,
        'name': f"{dataset['name']}-{dataset['id']}"
    }
    api.update_dataset(dataset_id=dataset_id, update_data=update_data)
    api.add_state_to_dataset(dataset_id=dataset_id, state='DELETED')
    return dataset_id,
```

---

## 8. `workers/workers/tasks/inspect.py`

### 8a. `origin_path` existence check before running `du`

**Problem:** The `inspect_dataset` task called `cmd.total_size(source)` (which shells
out to `du -sb`) without first checking that `source` exists. If the origin directory
was removed for any reason (concurrent deletion, test teardown, stale registration),
the task crashed with:

```
subprocess.CalledProcessError: Command '['du', '-sb', '...']' returned non-zero exit status 1
```

Because `inspect_dataset` is configured with auto-retry, this created a retry storm.

**Fix:** Add an existence check at the top of `inspect_dataset`, and separately
short-circuit if the dataset is already soft-deleted:

```python
def inspect_dataset(celery_task, dataset_id, **kwargs):
    dataset = api.get_dataset(dataset_id=dataset_id)

    if dataset.get('is_deleted'):
        raise exc.InspectionFailed(
            f'Dataset {dataset_id} is already deleted — skipping inspection.'
        )

    source = Path(dataset['origin_path'])
    if not source.exists():
        raise exc.InspectionFailed(
            f'origin_path does not exist: {source}'
        )
    # ... rest of inspection
```

Both `InspectionFailed` raises trigger `max_retries=0` so the task fails immediately
without retrying.

---

## 9. `bin/docker-reset.sh` (new file)

### 9a. Environment reset script

**Problem:** Before this script existed there was no safe, automated way to return
the Docker environment to a clean-slate state.  Developers had to manually track
and remove six distinct categories of generated state — named volumes, bind-mounted
database directories, `.env` files, RSA keys, TLS certs, and the Celery PID file —
in the right order and without accidentally affecting other Docker projects on the
same machine.

**What to create:** `bin/docker-reset.sh` — a Bash script that performs a full
environment reset in one command.  The script must be committed to the repository.

**Usage:**
```bash
bin/docker-reset.sh              # interactive — prompts before each destructive step
bin/docker-reset.sh --no-confirm # non-interactive — skips all prompts (CI / scripted use)
bin/docker-reset.sh -y           # shorthand for --no-confirm
```

**What the script does (in order):**

| Step | Action | Why |
|------|--------|-----|
| Guard | Abort if Docker is not running | Nothing to reset without Docker |
| Guard | Abort if `docker-compose.yml` is missing or not for this project | Prevents wrong-directory mistakes |
| Guard | Abort if `APP_ENV=docker` is not in `docker-compose.yml` | Only safe to run against Docker-mode instances |
| Guard | Abort if `APP_ENV=production` appears in any `.env` | Refuses to wipe a production instance |
| Step 1 | `docker compose down --remove-orphans` | Stop and remove all containers for this project |
| Step 2 | Remove all Docker named volumes labelled `com.docker.compose.project=bioloop` | Clears `rhythm_keys`, `signet_db`, `queue_volume`, `api_node_modules`, `ui_node_modules`, `secure_download_node_modules`, etc. |
| Step 3 | Remove `db/postgres/data/` and `db/mongo/data/` via a throwaway Alpine container | Docker writes DB files as root; using `docker run alpine rm -rf` avoids requiring host-level `sudo` |
| Step 3 | Remove `api/.db_seeded` marker | Forces the seed script to re-run on next startup |
| Step 4 | Remove `api/.env` and `workers/.env` | Forces full credential re-generation on next startup |
| Step 5 | Remove `api/keys/auth.key`, `api/keys/auth.pub`, `ui/.cert/cert.pem`, `ui/.cert/key.pem` | Forces RSA key and TLS cert regeneration on next startup |
| Step 6 | Remove `workers/celery_worker.pid` | Prevents Celery from refusing to start due to a stale PID file |

**Key design decisions:**

- **No `sudo`** — bind-mounted DB directories (written as root by Docker) are deleted
  using `docker run --rm -v ... alpine rm -rf` rather than `sudo rm -rf`. This keeps
  the script usable by any developer with Docker access.

- **Scoped to this project** — named volumes are removed by filtering on
  `--filter "label=com.docker.compose.project=bioloop"`. `docker volume prune` is
  explicitly avoided because it would affect every Docker project on the machine.

- **macOS-compatible** — `tr '[:upper:]' '[:lower:]'` is used instead of Bash 4's
  `${var,,}` syntax, which is not available in macOS's bundled Bash 3.2.

- **`set -euo pipefail`** — the script aborts on any unhandled error; combined with
  the guards it is safe to run repeatedly.

---

---

## 10. Port remapping — `ui/.env.default` and `api/.env.default`

### 10a. Auth return URLs and download server URL hardcoded to default ports

**Problem:** When running multiple parallel Bioloop instances on the same host,
each instance must use a distinct set of host-mapped ports (e.g. `11443` instead of
the default `10443`). The `VITE_CAS_RETURN`, `VITE_GOOGLE_RETURN`,
`VITE_CILOGON_RETURN`, and `VITE_MICROSOFT_RETURN` variables in `ui/.env.default`
are OAuth/CAS redirect URIs that the identity provider sends the browser back to
after login. `VITE_UPLOAD_API_BASE_PATH` (UI) and `DOWNLOAD_SERVER_BASE_URL` (API)
point to the secure-download service host port. All five values were hardcoded to
the default ports (`10443` / `10060`), so any instance running on remapped ports
would redirect logins to the wrong port — resulting in a browser
`ERR_CONNECTION_REFUSED` after SSO.

**Fix:** Update all five values to match the actual host ports for this instance:

```dotenv
# ui/.env.default — before
VITE_CAS_RETURN=https://localhost:10443/auth/iucas
VITE_GOOGLE_RETURN=https://localhost:10443/auth/google
VITE_CILOGON_RETURN=https://localhost:10443/auth/cil
VITE_MICROSOFT_RETURN=https://localhost:10443/auth/microsoft
VITE_UPLOAD_API_BASE_PATH=http://localhost:10060

# ui/.env.default — after (example: instance using 11xxx ports)
VITE_CAS_RETURN=https://localhost:11443/auth/iucas
VITE_GOOGLE_RETURN=https://localhost:11443/auth/google
VITE_CILOGON_RETURN=https://localhost:11443/auth/cil
VITE_MICROSOFT_RETURN=https://localhost:11443/auth/microsoft
VITE_UPLOAD_API_BASE_PATH=http://localhost:11060

# api/.env.default — before
DOWNLOAD_SERVER_BASE_URL=http://localhost:10060

# api/.env.default — after
DOWNLOAD_SERVER_BASE_URL=http://localhost:11060
```

After changing these files, recreate the affected containers so the new env vars
are picked up (they are injected via `env_file` at container start, not hot-reloaded):

```bash
docker compose up -d --force-recreate ui api secure_download
```

**Note:** These files are committed to the repository. When porting to an instance
with different host ports, update them before the first `docker compose up`.

---

## Summary Table

| # | File | Category | Impact without fix |
|---|------|----------|--------------------|
| 1a | `docker-compose.yml` | Volume mount | API→Rhythm 401/500 on every restart |
| 1b | `docker-compose.yml` | Named volumes | `vite: not found` / npm binaries missing |
| 1c | `docker-compose.yml` | Health checks | ~25 s dead wait on cold start |
| 2a | `rhythm/bin/entrypoint.sh` | `sed -i` bug | `WORKFLOW_AUTH_TOKEN` not written → 401 |
| 2b | `rhythm/bin/entrypoint.sh` | Key/token coupling | Stale token after volume clear → 401 |
| 3a | `api/bin/entrypoint.sh` | `sed -i` bug | OAuth credentials not written |
| 3b | `api/bin/entrypoint.sh` | npm guard | Missing `.bin` → service crash |
| 3c | `api/bin/entrypoint.sh` | prisma guard | ~2 s wasted per restart (minor) |
| 3d | `api/bin/entrypoint.sh` | seed guard | ~4 s wasted per restart (minor) |
| 4a | `workers/bin/entrypoint.sh` | PID file | Celery worker refuses to start |
| 5a | `ui/bin/entrypoint.sh` | TLS cert | ~3 s extra on cold start (minor) |
| 6a | `workers/workers/config/docker.py` | Config | Integrated workflow stalls for ~5 min |
| 7a | `workers/workers/tasks/delete.py` | Runtime | Delete workflow crashes (`hsi` missing) |
| 8a | `workers/workers/tasks/inspect.py` | Runtime | Inspect task crashes + retry storm |
| 9a | `bin/docker-reset.sh` *(new file)* | Tooling | No automated way to reset environment |
| 10a | `ui/.env.default`, `api/.env.default` | Config | SSO redirects to wrong port after login |

---

## Appendix: Test Notifications (seeded for `ripandey`)

The following 10 notifications were created in the system for the `ripandey` user
(id: 7, role: admin) to exercise all UI filters and metadata features. They are
seeded by running the Prisma script in `bin/docker-reset.sh`'s documentation or
via the API container:

```bash
docker compose exec api node -e "/* see below */"
```

| ID | Type | Label | State for `ripandey` | Notable features |
|----|------|-------|----------------------|-----------------|
| 1 | `info` | Welcome back to Bioloop | **Unread** | Label only, no text, no links |
| 2 | `warning` | Storage quota warning | **Unread** | Label + text, no links |
| 3 | `error` | Workflow failed | **Unread** | Label + text describing a pipeline error |
| 4 | `success` | Dataset upload complete | **Unread** | Text + 1 trusted internal link (`/datasets/1`) |
| 5 | `info` | New documentation available | **Unread + Bookmarked** | 1 trusted internal link + 1 untrusted external link (shows confirmation modal) |
| 6 | `system` | Scheduled maintenance window | **Archived** | Role broadcast to all admins (role_id 1); pre-archived |
| 7 | `dataset` | Dataset approved | **Read + Bookmarked** | 2 trusted internal links (`/datasets/2`, `/datasets/2/download`) |
| 8 | `system` | API token refreshed successfully | **Read** | Label only; already read |
| 9 | `workflow` | Nightly pipeline completed | **Unread** | Role broadcast to admins; `metadata.role_overrides.admin` changes label, text, and adds a link for admin users specifically |
| 10 | `info` | New user registered | **Unread** | `metadata.role_addons.admin` appends ` [action required]` to label, extra sentence to text, and adds a `/users` link — visible only to admin role |

### What each UI filter should show (for `ripandey`)

| Filter | Expected notifications |
|--------|----------------------|
| Default (no filter) | IDs 1, 2, 3, 4, 5, 9, 10 — the 7 unread non-archived items |
| **Unread** | IDs 1, 2, 3, 4, 5, 9, 10 |
| **Read** | IDs 7, 8 |
| **Bookmarked** | IDs 5, 7 |
| **Archived** | ID 6 |
| Search `"quota"` | ID 2 (label match) |
| Search `"pipeline"` | IDs 3, 9 (text/label match) |
| Search `"dataset"` | IDs 2, 4, 7 (label/text match) |
| Search `"maintenance"` | ID 6 (label match — visible only when Archived filter is also active) |

### Role override behaviour (`ripandey` is admin)

- **ID 9** — notification 9 has `metadata.role_overrides.admin`, so `ripandey` sees:
  - Label: `"Nightly pipeline completed (admin view)"`
  - Text: `"All 12 datasets were ingested successfully. 0 errors. Admin dashboard updated."`
  - Link: `Admin dashboard → /admin`
  - A non-admin user seeing the same notification would see the base label/text and no link.

- **ID 10** — notification 10 has `metadata.role_addons.admin`, so `ripandey` sees:
  - Label: `"New user registered [action required]"` (suffix appended)
  - Text ends with: `" Visit the admin panel to assign roles."` (suffix appended)
  - Extra link: `Manage users → /users`

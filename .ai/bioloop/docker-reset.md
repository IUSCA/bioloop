# Docker Environment Reset

How to reset all Docker-managed state for this Bioloop instance — containers, volumes, databases, generated credentials, keys, and certs — so the next `docker compose up` starts as if the Docker environment had never been brought up.

> **Scope:** This only resets Docker-managed resources. Source code, committed config files, and any non-Docker state are not affected.

Use the script (recommended — handles all steps without `sudo`):

```bash
bin/docker-reset.sh              # interactive — prompts before each step
bin/docker-reset.sh --no-confirm # non-interactive — skips all prompts
```

Or run the steps manually from the **repo root** (`bioloop-2/`):

---

## 1. Stop and remove all containers

```bash
docker compose down --remove-orphans
```

---

## 2. Remove Docker named volumes (this project only)

The project name is `bioloop`, so Docker prefixes every volume with `bioloop_`. The script uses `--filter label=com.docker.compose.project=bioloop` to avoid touching volumes from other projects.

```bash
docker volume ls --filter "label=com.docker.compose.project=bioloop" -q \
  | xargs docker volume rm
```

---

## 3. Remove bind-mounted database data

These directories are written by Docker containers running as `root`. A throwaway Alpine container removes them — no host-level `sudo` required.

```bash
# PostgreSQL (app database)
docker run --rm -v "$(pwd)/db/postgres:/mnt" alpine rm -rf /mnt/data

# MongoDB
docker run --rm -v "$(pwd)/db/mongo:/mnt" alpine rm -rf /mnt/data
```

Also remove the seed marker so the DB is re-seeded on next startup:

```bash
rm -f api/.db_seeded
```

---

## 4. Remove generated environment files

These are created by entrypoint scripts at runtime; `.env.default` files are the committed templates and must not be deleted.

```bash
rm -f api/.env
rm -f workers/.env
```

---

## 5. Remove generated keys and certs

```bash
# API RSA signing keys (bind-mounted from api/keys/)
rm -f api/keys/auth.key api/keys/auth.pub

# UI self-signed TLS cert (bind-mounted from ui/.cert/)
rm -f ui/.cert/cert.pem ui/.cert/key.pem

# Stale Celery pid file (prevents celery_worker from starting if present)
rm -f workers/celery_worker.pid
```

> **Rhythm keys** live in the `bioloop_rhythm_keys` named volume (removed in step 2).
> **Signet keys** live inside the signet container image (reset automatically when the container is removed).

---

## 6. Verify nothing is left

```bash
# Should print nothing
ls api/.env workers/.env api/.db_seeded 2>/dev/null
ls api/keys/auth.key api/keys/auth.pub 2>/dev/null
ls ui/.cert/cert.pem ui/.cert/key.pem 2>/dev/null
ls db/postgres/data db/mongo/data 2>/dev/null

# Should print nothing
docker volume ls | grep bioloop_
```

---

## 7. Bring the stack back up

```bash
docker compose up -d
```

Entrypoint scripts regenerate all keys, tokens, OAuth credentials, and certs automatically. Watch startup progress with:

```bash
docker compose logs -f
```

---

## What each service regenerates automatically

| Service | What gets regenerated |
|---|---|
| `rhythm` | RSA signing keys (`rhythm_keys` volume) → writes `WORKFLOW_AUTH_TOKEN` to `api/.env` |
| `api` | Reads `WORKFLOW_AUTH_TOKEN`, runs Prisma migrations + seed, calls signet for OAuth credentials → writes to `api/.env`, issues `APP_API_TOKEN` → writes to `workers/.env` |
| `signet` | RSA signing keys (inside container) |
| `ui` | Self-signed TLS cert (`ui/.cert/`) |
| `postgres` | Empty database (schema applied by `prisma migrate deploy`) |
| `mongo` | Empty database (init script from `db/mongo/mongo-init.js`) |
| `queue` | Empty RabbitMQ state |

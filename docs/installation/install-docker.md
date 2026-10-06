---
title: Docker
order: 1
---
<!-- cspell:ignore panl dbaeumer Hoppscotch -->
# Installation Guide

This guide sets up Bioloop with Docker Compose for local development and evaluation. The `docker-compose.yml` it uses is not a production configuration; see [Going to production](#going-to-production) for what this guide does not cover.

## Prerequisites

- Docker Engine with the Compose plugin, or Docker Desktop
- Git (for cloning the repository)

Node.js and OpenSSL are not needed on the host for this setup. Every service runs in a container (the UI and API containers use the `node:21` image), and the containers generate their own certificates and keys on first start. You only need Node.js on the host, version 18.12 or later per the `engines` field in `api/package.json` and `ui/package.json`, if you run the API or UI outside Docker (see the [Local installation guide](./install-local.md)) or want editor linting from a local `npm install`.

## Quick Start

1. Clone the repository and navigate to the project directory
```bash
git clone https://github.com/IUSCA/bioloop.git
cd bioloop
```

2. Run the one-time init script
```bash
./bin/init_dev.sh
```
This clones the [Signet](https://github.com/IUSCA/signet) and [Rhythm API](https://github.com/IUSCA/rhythm_api) source into `signet/signet` and `rhythm/rhythm_api`, and creates empty `api/.env` and `workers/.env` files owned by your user. You do not need to copy the `.env.default` files to `.env`: Compose loads the `.env.default` files directly, and the containers write generated credentials (the Rhythm workflow token, OAuth client credentials, the worker API token) into `api/.env` and `workers/.env` on first start.

3. Start the services
```bash
docker compose up -d
```
The first start takes several minutes while dependencies install and the database is migrated and seeded. Follow progress with `docker compose logs -f api`. When the API reports healthy in `docker compose ps`, open https://localhost and accept the self-signed certificate warning.

You do not need to generate certificates or keys by hand. On first start the `ui` container creates a self-signed certificate in `ui/.cert/`, and the `api` and `rhythm` containers create their JWT signing keys.

::: tip Signet and Rhythm images
The `signet` and `rhythm` services use prebuilt images from public projects on `harbor.sca.iu.edu`, which Compose pulls automatically. If your network cannot reach that registry, build the images locally from the repositories `init_dev.sh` cloned, using the same tags so Compose uses them instead of pulling:
```bash
docker build -t harbor.sca.iu.edu/signet/signet:latest signet/signet
docker build -t harbor.sca.iu.edu/rhythm/api:latest rhythm/rhythm_api
```
:::

## Development Setup Details

The project uses Docker Compose for development with some key features:

- Shared volumes for `node_modules` to avoid conflicts with host
- Hot-reload enabled for UI and API
- Automatic dependency installation on container startup
- PostgreSQL database with automatic migrations and seeding

### Services and host ports

| Service | Host port | Notes |
|---------|-----------|-------|
| `ui` | `127.0.0.1:443` | Vite dev server over HTTPS; proxies `/api` to the API |
| `api` | none | Listens on 3030 inside the Compose network only |
| `postgres` | `127.0.0.1:5433` | Application database (5432 inside the network) |
| `secure_download` | `3060` (all interfaces) | Token-validated file downloads |
| `mongo` | `127.0.0.1:27017` | Rhythm result backend |
| `queue` | `127.0.0.1:15672` | RabbitMQ management UI |
| `docs` | `127.0.0.1:5173` | This documentation site (VitePress) |

`signet`, `signet_db`, `rhythm`, `celery_worker`, and `watch` publish no host ports. `init_data_dirs` and `init_test_data` are one-shot setup containers that exit after they finish.

## Configuration

### Environment Variables

Each component requires specific environment variables to be set:

- **UI**: Authentication endpoints, API URL
- **API**: Database connection, JWT secrets
- **Workers**: Queue settings, processing parameters

See the `.env.default` files in each directory for required variables.

### Docker Configuration

The application behavior can be customized by editing:
- `docker-compose.yml` - Development setup
- `docker-compose-prod.yml` - Production configuration

## Database Setup

The `api` container runs `npx prisma migrate deploy` on every start and `npx prisma db seed` on its first start, so no manual step is needed. It writes an `api/.db_seeded` marker so later starts skip seeding.

To change the seeded users or other seed data, edit `api/prisma/seed_data/data.js` and re-run the seed:
```bash
docker compose exec api npx prisma db seed
```
Use `npx prisma migrate dev` inside the `api` container only when you change `api/prisma/schema.prisma` and need to create a new migration.

## Common Operations

### Starting Services
```bash
docker compose up -d      # Start all services
docker compose up ui api  # Start specific services
```

### Checking Status
```bash
docker compose ps         # List container status
docker compose logs -f    # Follow all logs
docker compose logs api   # View API logs
```

### Stopping Services
```bash
docker compose down       # Stop and remove containers
docker compose down -v    # Also remove named volumes
```

`docker compose down -v` does not remove the Postgres and MongoDB data, which live in bind mounts under `db/postgres/data` and `db/mongo/data`, or the credentials and keys written into `api/`, `workers/`, and `ui/.cert/`. For a full reset, use `bin/reset_docker.sh`, which prompts before each destructive step.

## Development Tools

### Code Linting

Two options for ESLint integration:

1. Local Installation:
```bash
# Install dev dependencies locally
cd api && npm install --save-dev
cd ../ui && npm install --save-dev

# Install VSCode ESLint extension
code --install-extension dbaeumer.vscode-eslint
```

2. Using Dev Containers:
- Install VSCode Dev Containers extension
- Open API and UI folders in separate VSCode windows
- Reopen in container when prompted

### Testing

1. UI Testing:
```bash
# Access the UI
open https://localhost
```
Note: Accept the self-signed certificate warning

2. API Testing:
```bash
# Check API health through the UI proxy (the API port is not published to the host)
curl -k https://localhost/api/health

# Or from inside the api container
docker compose exec api curl http://localhost:3030/health

# For complex API testing, use:
- Hoppscotch (https://hoppscotch.io)
- Insomnia
- Postman
```

## Queue System

The application uses [Rhythm API](https://github.com/IUSCA/rhythm_api) for task queues. The `queue` (RabbitMQ) and `mongo` services back it, and RabbitMQ stores its data in the `queue_volume` named volume, so no host permission setup is needed.

## Troubleshooting Guide

### Common Issues

1. Container Access:
```bash
docker compose exec ui bash
curl http://api:3030/health
```

2. Port Conflicts:
```bash
ss -ltnp     # or: netstat -panl | grep " LISTEN "
```
See [Services and host ports](#services-and-host-ports) for the ports the stack binds.

3. Logs:
```bash
docker compose logs -f service_name
```

### Development Tips

1. Use the quick start script:
```bash
bin/dev.sh
```
This writes your user's UID and GID to `.env` in the repository root and then runs `docker compose up -d`. Run `./bin/init_dev.sh` first.

2. Useful Docker Compose Aliases:
```bash
# Add to ~/.bashrc
alias dcu='docker compose up -d'
alias dcd='docker compose down --remove-orphans'
alias dcp='docker compose ps'
alias dce='docker compose exec'
alias dcl='docker compose logs'
```

## Going to production

This guide and `docker-compose.yml` are for local development and evaluation only. The dev stack takes shortcuts that are unsafe in production: it mounts the `api/` and `workers/` directories into other containers to share generated tokens, uses default database passwords from the `.env.default` files, serves a self-signed certificate from the Vite dev server, and registers OAuth clients automatically.

A production deployment also needs the following, which this guide does not cover:

- **DNS and TLS:** a real hostname and a trusted certificate in front of the UI, API, and secure download service.
- **Authentication:** OAuth client registration with Signet and the identity providers you use (CAS, Google, CILogon, or Microsoft), with production callback URLs.
- **Workers:** Celery workers configured and running where they can reach your instrument data and storage.
- **Storage and archive:** the landing, staging, and archival storage paths, including any tape or long-term archive integration.
- **Backups:** backups of the Postgres, MongoDB, and Signet databases and of generated keys and credentials.

`docker-compose-prod.yml` is a starting point for production containers. For background on the dev-only workarounds, see [Local development setup in Docker](../local_dev.md).

---
title: Docker
order: 1
---
<!-- cspell:ignore panl dbaeumer Hoppscotch -->
# Installation Guide

This guide will help you set up Bioloop using Docker for local development or production deployment.

## Prerequisites

- Docker Engine or Docker Desktop
- Node.js 16+ (for local development without Docker)
- OpenSSL (for generating certificates)
- Git (for cloning the repository)

## Quick Start

1. Clone the repository and navigate to the project directory
```bash
git clone https://github.com/IUSCA/bioloop.git
cd bioloop
```

2. Set up environment files
```bash
cp ui/.env.example ui/.env
cp api/.env.example api/.env
cp workers/.env.example workers/.env
```

3. Generate required certificates
```bash
# For UI HTTPS
cd ui/
mkdir .cert
openssl req -subj '/CN=localhost' -x509 -newkey rsa:4096 -nodes -keyout ./.cert/key.pem -out ./.cert/cert.pem 
cd ..

# For API JWT
cd api/keys
./genkeys.sh
cd ../..
```

4. Start the services
```bash
docker compose up -d
```

## Development Setup Details

The project uses Docker Compose for development with some key features:

- Shared volumes for `node_modules` to avoid conflicts with host
- Hot-reload enabled for UI and API
- Automatic dependency installation on container startup
- PostgreSQL database with automatic migrations

## Configuration

### Environment Variables

Each component requires specific environment variables to be set:

- **UI**: Authentication endpoints, API URL
- **API**: Database connection, JWT secrets
- **Workers**: Queue settings, processing parameters

See the `.env.example` files in each directory for required variables.

### Docker Configuration

The application behavior can be customized by editing:
- `docker-compose.yml` - Development setup
- `docker-compose-prod.yml` - Production configuration

## Database Setup

1. Run initial migrations:
```bash
docker compose exec api bash
npx prisma migrate dev
```

2. Seed the database:
```bash
# Edit api/prisma/data.js to add required users first
npx prisma db seed
```

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
docker compose down -v    # Also remove volumes
```

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
# Check API health
curl http://127.0.0.1:3030/health

# For complex API testing, use:
- Hoppscotch (https://hoppscotch.io)
- Insomnia
- Postman
```

## Queue System

The application uses [Rhythm API](https://github.com/IUSCA/rhythm_api) for task queues.

Setup queue permissions:
```bash
sudo chown -R ${USER}:docker db/queue/
```

## Troubleshooting Guide

### Common Issues

1. Container Access:
```bash
docker compose exec web bash
curl -X GET http://api:3030/
```

2. Port Conflicts:
```bash
netstat -panl | grep " LISTEN "
```

3. Logs:
```bash
docker compose logs -f service_name
```

### Development Tips

1. Use the quick start script:
```bash
bin/dev.sh
```
This handles:
- User permissions setup
- Image building
- Container orchestration

2. Useful Docker Compose Aliases:
```bash
# Add to ~/.bashrc
alias dcu='docker compose up -d'
alias dcd='docker compose down --remove-orphans'
alias dcp='docker compose ps'
alias dce='docker compose exec'
alias dcl='docker compose logs'
```

# Port Changes Documentation

## Overview

This document details all the port changes made to the bioloop-5 project to resolve conflicts with a parallel bioloop-4 instance running on the same host. All services were moved to ports in the 9000+ range to avoid conflicts.

## Port Mapping Summary

| Service | Original Port | New Port | Protocol | Notes |
|---------|---------------|----------|----------|-------|
| UI | 443 | 9443 | HTTPS | Frontend application |
| API | 3030 | 9001 | HTTP | Main API service |
| Postgres | 5432 | 9002 | TCP | Main database |
| Queue (RabbitMQ) | 5672 | 9003 | TCP | Message queue |
| Queue Management | 15672 | 9003 | HTTP | RabbitMQ management UI |
| Mongo | 27017 | 9004 | TCP | MongoDB database |
| Rhythm | 5001 | 9005 | HTTP | Workflow server |
| Secure Download | 3060 | 9006 | HTTP | File upload/download service |
| Signet | 5050 | 9007 | HTTP | Authentication service |
| Signet DB | 5432 | 9008 | TCP | Signet database |

## Files Modified

### 1. Docker Compose Configuration

**File:** `docker-compose.yml`
- **Project Name:** Changed from `bioloop` to `bioloop-5` for isolation
- **UI Service:** Added port mapping `127.0.0.1:9443:443`
- **API Service:** Added port mapping `127.0.0.1:9001:9001`
- **Secure Download:** Added port mapping `127.0.0.1:9006:9006`
- **Rhythm:** Added port mapping `127.0.0.1:9005:9005`
- **Signet:** Added port mapping `127.0.0.1:9007:9007`
- **Environment Variables:** Added authentication redirect URLs with correct ports

### 2. API Service Configuration

**File:** `api/config/default.json`
```json
{
  "express": {
    "port": 9001
  },
  "workflow_server": {
    "base_url": "http://127.0.0.1:9005"
  }
}
```

**File:** `api/config/production.json`
```json
{
  "rhythm": {
    "base_url": "http://172.19.0.4:9005"
  }
}
```

**File:** `api/bin/entrypoint.sh`
```bash
--url http://signet:9007/create_client
```

### 3. Secure Download Service

**File:** `secure_download/config/default.json`
```json
{
  "express": {
    "port": 9006,
    "host": "0.0.0.0"
  },
  "oauth": {
    "jwks_uri": "http://127.0.0.1:9007/oauth/jwks"
  }
}
```

### 4. Nginx Configuration

**File:** `nginx/conf/app.conf`
```nginx
proxy_pass http://host.docker.internal:9001/;
```

**File:** `secure_download/nginx/conf/app.conf`
```nginx
proxy_pass http://host.docker.internal:9006/;
```

### 5. Frontend Configuration

**File:** `ui/vite.config.js`
```javascript
proxy: {
  "/api": {
    target: "http://api:9001",
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/api/, ""),
  }
}
```

**File:** `ui/src/config.js`
```javascript
casReturn: "https://localhost:9443/auth/iucas",
googleReturn: "https://localhost:9443/auth/google",
cilogonReturn: "https://localhost:9443/auth/cil",
microsoftReturn: "https://localhost:9443/auth/microsoft"
```

**File:** `docker-compose.yml` (UI environment variables)
```yaml
environment:
  - VITE_CAS_RETURN=https://localhost:9443/auth/iucas
  - VITE_GOOGLE_RETURN=https://localhost:9443/auth/google
  - VITE_CILOGON_RETURN=https://localhost:9443/auth/cil
  - VITE_MICROSOFT_RETURN=https://localhost:9443/auth/microsoft
  - VITE_UPLOAD_API_BASE_PATH=https://localhost:9443
```

### 6. Test and Development Files

**File:** `api/tests/request.js`
```javascript
const server = 'http://localhost:9001';
```

**File:** `workers/workers/config/celeryconfig.py`
```python
# result_backend = 'db+postgresql://username:password@localhost:9002/celery'
```

**File:** `metrics/prometheus/config/prometheus.yml`
```yaml
# - targets: ["host.docker.internal:9001"]
```

**File:** `docker-compose-e2e.yml`
```yaml
expose: 9001
ports: 127.0.0.1:9001:9001
healthcheck: 127.0.0.1:9001/health
postgres: 127.0.0.1:9002:5432
```

### 7. Documentation Files

**File:** `docs/api/01-core/configuration.md`
```json
{
  "express": {
    "port": 9001,
    "host": "localhost"
  }
}
```

**File:** `docs/local_dev.md`
```yaml
test: ["CMD", "curl", "-f", "http://localhost:9001/health"]
WORKFLOW_SERVER_BASE_URL=http://rhythm:9005
```

**File:** `docs/installation/install-local.md`
```bash
DATABASE_URL="postgresql://appuser:example@localhost:9002/app?schema=public"
VITE_API_REDIRECT_URL=http://localhost:9001
# Port forwarding: 9001, 9004, 9003
```

**File:** `docs/worker/overview.md`
```bash
# Port forwarding: 9001, 9004, 9003
ssh -R 9101:localhost:9001 -R 9104:localhost:9004 -R 9103:localhost:9003
```

**File:** `docs/installation/install-docker.md`
```bash
curl http://127.0.0.1:9001/health
curl -X GET http://api:9001/
```

**File:** `api/README.md`
```bash
DATABASE_URL="postgresql://appuser:example@postgres:9002/app?schema=public"
DATABASE_URL="postgresql://appuser:example@localhost:9002/app?schema=public"
```

## Key Changes Made

### 1. Project Isolation
- Changed Docker Compose project name from `bioloop` to `bioloop-5`
- This prevents conflicts with the parallel bioloop-4 instance

### 2. Port Range Strategy
- Moved all services to 9000+ port range
- This avoids conflicts with common default ports (5432, 27017, 5672, etc.)

### 3. Frontend Proxy Configuration
- Updated Vite proxy to use Docker service names instead of localhost
- Fixed authentication redirect URLs to use correct port 9443

### 4. Environment Variable Override
- Removed dependency on `.env.default` file for critical port settings
- Set environment variables directly in docker-compose.yml

## Verification Commands

### Check Service Status
```bash
docker compose ps
```

### Test API Health
```bash
curl -f http://localhost:9001/health
```

### Test UI Access
```bash
curl -f -I -k https://localhost:9443/
```

### Test API Proxy
```bash
curl -f -k https://localhost:9443/api/health
```

### Check Environment Variables
```bash
docker compose exec ui printenv | grep -E "VITE_.*_RETURN"
```

## Current Working Configuration

All services are now running successfully with the new port configuration:

- ✅ **UI**: `https://localhost:9443`
- ✅ **API**: `http://localhost:9001`
- ✅ **API Proxy**: Working via `/api/*` routes
- ✅ **Authentication Redirects**: Using correct port 9443
- ✅ **Project Isolation**: No conflicts with bioloop-4 instance

## Notes

- The UI runs on HTTPS (port 9443) with self-signed certificates
- API calls from UI are proxied through Vite to the API service
- All authentication redirects now use the correct port 9443
- Database connections use the new port mappings internally
- External access is limited to localhost (127.0.0.1) for security

## Troubleshooting

If you encounter port conflicts in the future:
1. Check for other services using the same ports: `lsof -i :PORT`
2. Verify Docker Compose project isolation
3. Ensure all configuration files are updated consistently
4. Restart services after configuration changes

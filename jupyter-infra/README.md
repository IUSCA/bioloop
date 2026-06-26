# JupyterHub Production Setup

## Directory Structure

```
jupyter-infra/
├── docker-compose.yml          # Runs Hub + Postgres
├── network-setup.sh            # Creates Docker network + iptables rules
├── hub/
│   ├── jupyterhub_config.py    # Main Hub configuration
│   ├── .env.template           # Copy to .env and fill in secrets
│   └── hub_api.py              # Portal backend helper (copy to your portal)
├── notebook-image/
│   ├── Dockerfile              # Hardened notebook container image
│   ├── pip.conf                # Blocks all pip installs
│   ├── jupyter_server_config.py  # Restrict server features (no terminals, limited file browser)
│   ├── jupyter_notebook_config.py
│   └── kernel.json             # Custom kernel config (no root, limited resources)
└── nginx/
    └── jupyterhub.conf         # nginx TLS termination + proxy
```

---

## Deployment Order

### 1. Host prerequisites
```bash
apt install -y docker.io docker-compose-plugin nginx certbot \
               iptables-persistent ipset

# Create data directories
mkdir -p ./data/users ./data/shared ./logs/jupyterhub
```

### 2. TLS certificate
```bash
certbot certonly --nginx -d notebooks.research-portal.com
```

### 3. Network + firewall
```bash
export PORTAL_HOST=research-portal.com
chmod +x network-setup.sh
./network-setup.sh

# Add IP refresh to cron
echo "*/5 * * * * root PORTAL_HOST=research-portal.com /usr/local/bin/refresh-portal-ipset.sh" \
  >> /etc/cron.d/jupyter-portal-ipset
```

### 4. Build notebook image
```bash
cd notebook-image
docker build -t your-registry/research-notebook:latest .
docker push your-registry/research-notebook:latest
```

### 5. Configure secrets
```bash
cp hub/.env.template hub/.env
# Edit hub/.env — fill in all values, especially:
#   JUPYTERHUB_COOKIE_SECRET=$(openssl rand -hex 32)
#   HUB_API_TOKEN=$(openssl rand -hex 32)
#   POSTGRES_PASSWORD=$(openssl rand -hex 16)
```

### 6. Start Hub
```bash
docker compose up -d
docker compose logs -f hub
```

### 7. nginx
```bash
cp nginx/jupyterhub.conf /etc/nginx/sites-available/jupyterhub
ln -s /etc/nginx/sites-available/jupyterhub /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 8. Portal backend
Copy `hub/hub_api.py` into your portal codebase.
Set environment variables:
```
HUB_API_URL=https://notebooks.research-portal.com/hub/api
HUB_API_TOKEN=<same value as in hub/.env>
HUB_BASE_URL=https://notebooks.research-portal.com
```

---

## Auth Flow (named-server)

```
User clicks "Open Notebook" in portal
  → Portal calls ensure_user() + ensure_server_running() + create_token()
  → Portal redirects to: https://notebooks.research-portal.com/user/{u}/?token=XXX

  OR (returning user with expired cookie, bookmarked URL):
User visits bookmarked URL directly
  → Hub sees no valid cookie
  → Hub redirects to: https://research-portal.com/launch-notebook?next=/user/{u}/lab
  → Portal checks portal session (auto-login if valid, login page if not)
  → Portal issues new token, redirects back to Hub
  → Hub validates token, sets 7-day cookie, strips token from URL
  → User lands in notebook
```

---

## Security Controls Summary

| Control | Implementation |
|---|---|
| No inter-container traffic | `icc=false` on Docker network |
| No internet egress | iptables DROP on container subnet |
| Portal API allowed | iptables + ipset allowlist on port 443 |
| No pip install | `pip.conf` bad index + read-only site-packages |
| No shell terminal | `terminals_enabled = False` in server config |
| No root in container | `USER jovyan`, `allow_root = False` |
| File browser jailed | `root_dir = /home/jovyan/work` |
| Resource limits | `mem_limit`, `cpu_limit`, `pids_limit` via Docker |
| No privilege escalation | `no-new-privileges`, `cap_drop ALL` |
| Users isolated from each other | Per-user volumes, icc=false |
| Hub API restricted | Users get `self` scope only |
| Idle containers culled | jupyterhub-idle-culler (1h idle, 24h max) |
| Cookie expires | `cookie_max_age_days = 7` |
| Emergency logout-all | Rotate `JUPYTERHUB_COOKIE_SECRET` + restart Hub |

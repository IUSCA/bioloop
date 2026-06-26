"""
JupyterHub Production Configuration
~1000 users, ~100 simultaneous sessions

Security posture:
  - Containers on isolated bridge network (no inter-container comms)
  - Egress: portal API only (iptables enforced on host)
  - No terminals, no pip install, read-only site-packages
  - Unauthenticated requests redirect to portal (no Hub login page shown)
  - 7-day session cookie; idle servers culled after 1h; hard limit 24h
"""

import hashlib
import hmac as _hmac
import logging
import os
import sys
import time
import urllib.parse

from jupyterhub.auth import Authenticator
from jupyterhub.handlers import BaseHandler
from jupyterhub.utils import url_path_join

log = logging.getLogger('jupyterhub')

# fail fast if critical configuration values are missing
DB_PASSWORD = os.environ['POSTGRES_PASSWORD']  # password for the 'jupyterhub' Postgres user; set in docker-compose.yml and db init scripts
_PORTAL_LAUNCH_URL   = os.environ['PORTAL_LAUNCH_URL']   # e.g. https://research-portal.com/launch-notebook
_TICKET_SECRET       = os.environ['PORTAL_TICKET_SECRET'].encode() # bytes secret for HMAC-signed portal login tickets; must match the portal's PORTAL_TICKET_SECRET
JUPYTERHUB_COOKIE_SECRET_HEX = os.environ['JUPYTERHUB_COOKIE_SECRET_HEX']  # 32-byte hex string for Hub session cookie secret
DOCKER_SPAWNER_IMAGE = os.environ['NOTEBOOK_IMAGE']  # Docker image for single-user servers
DATA_BASE_PATH = os.environ['BIOLOOP_DATA_BASE'] # Base path on the host for user data volumes
PORTAL_API_URL = os.environ['PORTAL_API_URL']  # injected into single-user containers so notebooks can call back to the portal backend
HUB_API_TOKEN = os.environ['HUB_API_TOKEN']  # pre-shared token for the portal backend to call the Hub API

# =============================================================================
# NETWORKING
# =============================================================================

# Hub binds on all interfaces inside the container so spawned containers
# on the jhub-users network can reach it via the container's bridge IP.
# External exposure is controlled by Docker network isolation, not bind address.
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.hub_ip
c.JupyterHub.hub_ip = '0.0.0.0'
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.hub_port
# Note: 8081 is the default; this line is explicit for documentation purposes.
c.JupyterHub.hub_port = 8081

# Tell single-user containers which hostname to use when calling back to the Hub.
# 'jupyterhub' is the container_name defined in docker-compose.yml; Docker's
# internal DNS resolves it to the Hub's IP from any container on jhub-users.
# hub_connect_port is deprecated since 0.9 — use hub_connect_url if you need a
# non-default port (see hub_connect_url docs below).
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.hub_connect_ip
c.JupyterHub.hub_connect_ip = 'jupyterhub'

# Public-facing proxy bind — listen on all container interfaces.
# The host-side port mapping (127.0.0.1:8000) ensures only nginx on the
# host can reach this port; the container must not bind to 127.0.0.1 or
# Docker's port forwarding cannot deliver traffic to it.
# Modern alternative: c.JupyterHub.bind_url = 'http://:8000'  (added in 0.9)
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.ip
c.JupyterHub.ip = '0.0.0.0'
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.port
c.JupyterHub.port = 8000



# =============================================================================
# AUTHENTICATOR
# =============================================================================
#
# Auth design:
#   - Hub never shows its own login page.
#   - Unauthenticated requests (expired cookie, bookmarks) are caught by
#     auto_login → login_url() → /hub/portal-login, which redirects to the
#     portal's /launch-notebook endpoint with ?next=<hub-internal-url>.
#   - The portal validates the user, generates an HMAC-signed ticket, and
#     redirects the browser back to /hub/portal-login?ticket=T&username=U&ts=TS&next=N.
#   - The Hub validates the HMAC, sets a session cookie, and follows `next`.
#
# Why HMAC tickets instead of Hub API tokens:
#   JupyterHub 5.x single-user servers use OAuth2 for browser auth.
#   Hub API tokens only work for direct API calls; sending ?token= to a
#   single-user server URL triggers an OAuth2 redirect that discards the
#   token, resulting in 403.  HMAC tickets are validated server-side in
#   the Hub handler before any OAuth2 flow begins.
#
# Shared secret — generate once and add to both Hub and portal .env:
#   python -c "import secrets; print(secrets.token_hex(32))"
#
_TICKET_MAX_AGE_SECS = 300   # ticket expires after 5 minutes


class PortalLoginHandler(BaseHandler):
    """
    Mounted at /hub/portal-login.

    GET with ?ticket=T&username=U&ts=TS&next=N
        Validate HMAC ticket.  On success: set Hub session cookie,
        redirect to `next` (which may be an OAuth2 authorize URL — the
        Hub's OAuth2 machinery then completes and the user lands at their
        actual notebook page).

    GET without a ticket (or invalid/expired ticket)
        Redirect to the portal's launch-notebook endpoint so the user
        can log in and come back with a fresh ticket.
        next=<hub-internal-url> is forwarded so the portal can echo it
        back and the user eventually reaches the page they requested.
    """

    async def get(self):
        ticket   = self.get_argument('ticket',   None)
        username = self.get_argument('username', None)
        ts_str   = self.get_argument('ts',       None)
        # `next` defaults to the user's notebook home; the Hub will decide
        # the canonical URL after OAuth2 if next is a Hub-internal path.
        next_url = self.get_argument('next', f'/hub/home')

        if ticket and username and ts_str:
            try:
                ts = int(ts_str)
            except ValueError:
                self.set_status(400)
                self.finish("Bad ticket: ts must be an integer")
                return

            age = abs(time.time() - ts)
            log.info(
                "portal-login: username=%s ts=%s age=%.1fs secret_set=%s",
                username, ts, age, bool(_TICKET_SECRET),
            )

            if age >= _TICKET_MAX_AGE_SECS:
                log.warning(
                    "portal-login: ticket EXPIRED for %s (age=%.1fs > %ss)",
                    username, age, _TICKET_MAX_AGE_SECS,
                )
                self.set_status(401)
                self.finish(
                    "Notebook login link has expired (ticket is more than "
                    f"{_TICKET_MAX_AGE_SECS}s old). "
                    "Please return to the portal and try again."
                )
                return

            expected = _hmac.new(
                _TICKET_SECRET,
                f'{username}:{ts}'.encode(),
                hashlib.sha256,
            ).hexdigest()

            if not _hmac.compare_digest(ticket, expected):
                log.warning(
                    "portal-login: HMAC mismatch for %s — "
                    "check that PORTAL_TICKET_SECRET matches in both the Hub "
                    "container (.env) and the portal backend environment. "
                    "Hub secret is %s.",
                    username,
                    "SET (non-empty)" if _TICKET_SECRET else "EMPTY (not configured!)",
                )
                self.set_status(401)
                self.finish(
                    "Invalid ticket signature. "
                    "PORTAL_TICKET_SECRET may differ between the portal and Hub. "
                    "Please return to the portal and try again."
                )
                return

            # Valid ticket — create Hub session and redirect.
            # auth_to_user() creates the user record if it doesn't
            # exist and applies group/admin rules from the authenticator.
            log.info("portal-login: valid ticket for %s, setting session cookie", username)
            user = await self.auth_to_user({'name': username})
            self.set_login_cookie(user)
            self.redirect(next_url)
            return

        # No ticket — bounce to portal with the Hub's `next` URL preserved.
        # Portal receives ?next=<hub-internal-url>, authenticates the user,
        # generates a ticket, and redirects back here with ticket+next.
        portal_url = (
            f'{_PORTAL_LAUNCH_URL}'
            f'?next={urllib.parse.quote(next_url, safe="")}'
        )
        self.redirect(portal_url)


class PortalAuthenticator(Authenticator):
    """
    Authenticator that delegates all browser auth to the portal.
    Registers /hub/portal-login and sets it as the auto-login target
    so the Hub never shows its own login page.
    """

    def login_url(self, base_url: str) -> str:
        """Called by JupyterHub when auto_login redirects an unauthenticated user."""
        return url_path_join(base_url, 'portal-login')

    def get_handlers(self, app):
        """Register the portal-login route on the Hub."""
        return [(r'/portal-login', PortalLoginHandler)]

    async def authenticate(self, handler, data):
        # The standard POST-form authentication path is never used;
        # all login goes through PortalLoginHandler.get().
        return None


# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.authenticator_class
c.JupyterHub.authenticator_class = PortalAuthenticator

# With auto_login=True, any unauthenticated Hub request is automatically
# redirected to login_url() (i.e. /hub/portal-login) instead of showing
# the Hub login form.  This covers cookie expiry and direct URL access.
# https://jupyterhub.readthedocs.io/en/stable/reference/api/auth.html#jupyterhub.auth.Authenticator.auto_login
c.Authenticator.auto_login = True

# Allow all users who arrive via a valid portal ticket.
# The portal controls who can log in; the Hub enforces active session policy.
# https://jupyterhub.readthedocs.io/en/stable/reference/api/auth.html#jupyterhub.auth.Authenticator.allow_all
c.Authenticator.allow_all = True



# =============================================================================
# SESSION COOKIE
# =============================================================================

# Default is 14 days in JupyterHub 5.x (was 2 days in older releases).
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.cookie_max_age_days
c.JupyterHub.cookie_max_age_days = 7

# Rotate this secret to instantly invalidate ALL active sessions (emergency logout).
# Must be 32 bytes, set via environment / secret manager — never hardcode.
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.cookie_secret
c.JupyterHub.cookie_secret = bytes.fromhex(JUPYTERHUB_COOKIE_SECRET_HEX)


# =============================================================================
# SPAWNER  —  DockerSpawner
# =============================================================================

# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.spawner_class
c.JupyterHub.spawner_class = 'dockerspawner.DockerSpawner'

# --- Image ---
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.image
c.DockerSpawner.image = DOCKER_SPAWNER_IMAGE

# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.pull_policy
# Choices: 'ifnotpresent' (default), 'always', 'never', 'skip'
c.DockerSpawner.pull_policy = 'ifnotpresent'   # change to 'always' during rollout

# --- Network ---
# Attach spawned containers to the same named bridge as the Hub so they can
# reach it directly via Docker DNS ('jupyterhub' -> Hub container IP).
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.network_name
c.DockerSpawner.network_name   = 'jhub-users'
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.use_internal_ip
# Default is True when network_name is set to a user-defined network (not 'bridge').
c.DockerSpawner.use_internal_ip = True
# Don't pass extra_networks — one network, fully controlled.

# --- Named-server support ---
# Each user gets one default server. Named servers allow multiple per user;
# set to False to disable that (recommended unless you need it).
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.allow_named_servers
c.JupyterHub.allow_named_servers   = False
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.name_template
# Default unnamed template is '{prefix}-{username}' (prefix defaults to 'jupyter').
c.DockerSpawner.name_template      = 'jupyter-{username}'

# --- Resource limits (enforced by cgroups via Docker) ---
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.mem_limit
# Supports K/M/G/T suffixes or a callable (spawner) -> str for per-user limits.
c.DockerSpawner.mem_limit      = '4G'
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.mem_guarantee
c.DockerSpawner.mem_guarantee  = '512M'
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.cpu_limit
# Accepts a float (cores) or a callable (spawner) -> float for per-user limits.
c.DockerSpawner.cpu_limit      = 2.0
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.cpu_guarantee
c.DockerSpawner.cpu_guarantee  = 0.5

# --- Volumes ---
# Each user gets their own persistent directory; shared datasets read-only.
# Use absolute paths — Docker API (even from inside a container) requires them.
# On macOS: add these paths to Docker Desktop > Preferences > Resources > File Sharing
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.volumes
# {username} is substituted with the authenticated user's Hub username.

c.DockerSpawner.volumes = {
    f'{DATA_BASE_PATH}/users/{{username}}': {
        'bind': '/home/jovyan/work',
        'mode': 'rw',
    },
    f'{DATA_BASE_PATH}/shared': {
        'bind': '/home/jovyan/work/datasets',
        'mode': 'ro',
    },
}

# --- Security: harden the container at runtime ---
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.extra_host_config
c.DockerSpawner.extra_host_config = {
    # Drop every Linux capability — container runs with none.
    'cap_drop': ['ALL'],

    # Prevent privilege escalation via setuid binaries.
    'security_opt': ['no-new-privileges:true'],

    # Prevent fork bombs.
    'pids_limit': 200,

    # Limit writable /tmp size.
    'tmpfs': {'/tmp': 'size=256m,mode=1777'},

    # ulimits: cap open files and processes per container.
    'ulimits': [
        {'name': 'nofile', 'soft': 1024,  'hard': 2048},
        {'name': 'nproc',  'soft': 128,   'hard': 200},
    ],

    # Do NOT set network_mode here — container is on jhub-users bridge.
    # Egress is restricted by iptables on the host (see network-setup.sh).
}

# --- Environment passed into each container ---
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.environment
# Values may be strings or callables: (spawner) -> str
c.DockerSpawner.environment = {
    'PORTAL_API_URL': PORTAL_API_URL,
    'GRANT_SUDO': '0',              # never grant sudo inside container
    'RESTARTABLE': 'yes',
}

# --- Remove container when server is stopped (keeps Docker clean) ---
# User files are safe because they live in the mounted volume, not the container.
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.remove
# Default: False
c.DockerSpawner.remove = True

# --- Notebook directory inside the container ---
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.notebook_dir
# ~ and {username} are expanded at spawn time.
c.DockerSpawner.notebook_dir = '/home/jovyan/work'

# --- Start timeout: give containers up to 60s to spawn ---
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.start_timeout
# Default: 60 seconds
c.DockerSpawner.start_timeout = 60
# https://jupyterhub-dockerspawner.readthedocs.io/en/latest/api/index.html#dockerspawner.DockerSpawner.http_timeout
# Default: 30 seconds — doubled here to accommodate slow container launch on cold pull.
c.DockerSpawner.http_timeout  = 60



# =============================================================================
# CONCURRENT LIMITS
# =============================================================================

# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.concurrent_spawn_limit
# Default is 100 in JupyterHub 5.x. Lowering to 20 prevents Docker engine
# overload during user rush-hour (e.g. beginning of a lab session).
c.JupyterHub.concurrent_spawn_limit = 20    # max containers spawning at once
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.active_server_limit
# Default is 0 (no limit). Capped here to match expected user population.
c.JupyterHub.active_server_limit    = 100   # hard cap on running servers


# =============================================================================
# IDLE CULLING SERVICE
# Install: pip install jupyterhub-idle-culler
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.services
# =============================================================================
c.JupyterHub.services = [
    {
        'name':    'idle-culler',
        'admin':   True,
        'command': [
            sys.executable, '-m', 'jupyterhub_idle_culler',
            '--timeout=3600',       # shut down after 1h idle
            '--max-age=86400',      # hard 24h lifetime per container
            '--cull-every=300',     # check every 5 min
            '--concurrency=5',      # parallel cull requests
        ],
    }
]


# =============================================================================
# RBAC — restrict what user tokens can do via the Hub API
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.load_roles
# =============================================================================
c.JupyterHub.load_roles = [
    {
        # Admin token used by your portal backend to create users / tokens.
        'name': 'portal-backend',
        'scopes': [
            'admin:users',
            'admin:servers',
            'tokens',
            'read:users',
        ],
        'services': ['portal-backend'],
    },
    {
        # Regular users can only manage their own server — cannot enumerate others.
        'name': 'user',
        'scopes': ['self'],
    },
]

# Register the portal-backend service explicitly to avoid the implicit-creation warning.
c.JupyterHub.services = c.JupyterHub.services + [
    {
        'name': 'portal-backend',
    }
]

# Pre-shared token your portal backend uses to call the Hub API.
# Generate with: openssl rand -hex 32
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.service_tokens
c.JupyterHub.service_tokens = {
    HUB_API_TOKEN: 'portal-backend',
}


# =============================================================================
# DATABASE
# =============================================================================

# Use Postgres in production — SQLite is not safe for concurrent load.
# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.db_url
c.JupyterHub.db_url = os.environ.get(
    'JUPYTERHUB_DB_URL',
    'postgresql+psycopg2://jupyterhub:{password}@db:5432/jupyterhub'.format(
        password=DB_PASSWORD
    )
)


# =============================================================================
# LOGGING & AUDIT
# =============================================================================

# https://jupyterhub.readthedocs.io/en/stable/reference/api/app.html#jupyterhub.app.JupyterHub.log_level
c.JupyterHub.log_level = 'INFO'
# extra_log_file is deprecated since 0.8.2 — redirect logs via Docker/process logging instead.

# To add a pre-spawn audit hook, uncomment and implement the following:
# https://jupyterhub.readthedocs.io/en/stable/reference/api/spawner.html#jupyterhub.spawner.Spawner.pre_spawn_hook
# async def audit_hook(spawner):
#     spawner.log.info('User %s starting server', spawner.user.name)
# c.Spawner.pre_spawn_hook = audit_hook

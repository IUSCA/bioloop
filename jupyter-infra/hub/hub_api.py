"""
hub_api.py  —  Portal backend helper for JupyterHub REST API calls.

This is what you include in your portal's backend codebase.
It replaces the placeholder hub_api module mentioned in earlier examples.

Dependencies: httpx, fastapi (for the route example at the bottom)
"""

from __future__ import annotations

import hashlib
import hmac as _hmac
import os
import logging
import time
import urllib.parse
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

HUB_API_URL          = os.environ.get('HUB_API_URL')           # https://notebooks.research-portal.com/hub/api
HUB_API_TOKEN        = os.environ.get('HUB_API_TOKEN')         # pre-shared admin token (Hub service token)
HUB_BASE_URL         = os.environ.get('HUB_BASE_URL', '')      # https://notebooks.research-portal.com
PORTAL_TICKET_SECRET = os.environ.get('PORTAL_TICKET_SECRET', '').encode()  # shared secret with Hub

_HEADERS = {"Authorization": f"token {HUB_API_TOKEN}"}


# =============================================================================
# Users
# =============================================================================

async def ensure_user(username: str) -> None:
    """
    Create the JupyterHub user if they don't exist.
    Safe to call on every launch — 409 Conflict is silently ignored.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{HUB_API_URL}/users/{username}",
            headers=_HEADERS,
            timeout=10,
        )
        if resp.status_code not in (201, 409):
            logger.error("ensure_user failed: %s %s", resp.status_code, resp.text)
            resp.raise_for_status()


# =============================================================================
# Launch tickets  (browser authentication — replaces Hub API tokens in URLs)
# =============================================================================
#
# Why not Hub API tokens?
#   JupyterHub 2.x single-user servers use OAuth2 for browser auth.  Sending
#   a Hub API token in a redirect URL (?token=...) hits the single-user
#   server's OAuth2 proxy, which has no Hub session yet and discards the
#   token, resulting in 403.  HMAC tickets are validated by the Hub's own
#   handler *before* OAuth2 starts, so they reliably establish a session.
#
# The shared secret (PORTAL_TICKET_SECRET) must be set identically in:
#   - This portal backend's environment
#   - The Hub container's environment (jupyterhub_config.py reads it)
# Generate once:  python -c "import secrets; print(secrets.token_hex(32))"
#

def create_launch_ticket(
    username: str,
    next_path: str = '',
    max_age: int = 300,
) -> dict:
    """
    Generate a short-lived HMAC-signed ticket for browser authentication.
    Does NOT make any Hub API calls — safe to call on every launch.

    The ticket is valid for `max_age` seconds (default 5 min).

    Returns a dict with everything the portal UI needs to build the
    redirect URL:
        {
            'redirect_url': 'https://notebooks.research-portal.com/hub/portal-login?...',
            'ticket':   'abc123...',
            'username': 'deduggi',
            'ts':       1712345678,
            'next':     '/user/deduggi/',
        }

    Usage on the portal UI side:
        Redirect the browser directly to `redirect_url`.
        No need to construct the URL manually.
    """
    ts     = int(time.time())
    next_  = next_path or f'/user/{username}/'
    ticket = _hmac.new(
        PORTAL_TICKET_SECRET,
        f'{username}:{ts}'.encode(),
        hashlib.sha256,
    ).hexdigest()

    params = urllib.parse.urlencode({
        'ticket':   ticket,
        'username': username,
        'ts':       ts,
        'next':     next_,
    })
    return {
        'redirect_url': f'{HUB_BASE_URL}/hub/portal-login?{params}',
        'ticket':   ticket,
        'username': username,
        'ts':       ts,
        'next':     next_,
    }


# =============================================================================
# Hub API tokens  (for server-side API calls only — NOT for browser auth)
# =============================================================================

async def create_token(
    username: str,
    expires_in: int = 300,
    note: Optional[str] = None,
) -> dict:
    """
    Create a short-lived Hub API token for server-side use (e.g. programmatic
    API calls from the portal backend).  Do NOT use this token in browser
    redirect URLs — use create_launch_ticket() instead.

    Returns the full token dict:
        {
          "token":      "abc123...",   ← use in Authorization: token <value> headers
          "id":         "42",
          "expires_at": "2024-...",
          "note":       "...",
        }
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{HUB_API_URL}/users/{username}/tokens",
            headers=_HEADERS,
            json={
                "note":       note or f"portal-launch-{username}",
                "expires_in": expires_in,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


async def delete_token(username: str, token_id: str) -> None:
    """
    Revoke a Hub token.
    Call this when the user logs out of your portal.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{HUB_API_URL}/users/{username}/tokens/{token_id}",
            headers=_HEADERS,
            timeout=10,
        )
        if resp.status_code == 404:
            return   # already gone — that's fine
        resp.raise_for_status()


# =============================================================================
# Servers
# =============================================================================

async def ensure_server_running(username: str) -> bool:
    """
    Start the user's default server if it isn't already running.

    Returns True if a new spawn was triggered, False if already running.
    The server may still be spawning when this returns — the Hub proxy
    will hold the user's browser connection open until it's ready.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{HUB_API_URL}/users/{username}/server",
            headers=_HEADERS,
            timeout=10,
        )
        if resp.status_code == 201:
            logger.info("Spawning server for %s", username)
            return True
        if resp.status_code in (400, 409):
            # Already running or pending
            return False
        resp.raise_for_status()
        return False


async def get_server_status(username: str) -> Optional[dict]:
    """
    Returns the user's server dict if running, or None if not.
    Useful for showing a 'your notebook is starting...' UI in the portal.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{HUB_API_URL}/users/{username}",
            headers=_HEADERS,
            timeout=10,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        return data.get("servers", {}).get("", None)  # "" = default server


async def stop_server(username: str) -> None:
    """
    Stop the user's server. Their files (in the volume) are not affected.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{HUB_API_URL}/users/{username}/server",
            headers=_HEADERS,
            timeout=10,
        )
        if resp.status_code in (204, 404):
            return
        resp.raise_for_status()


# =============================================================================
# Portal routes — /launch-notebook and /logout-notebook
# =============================================================================
# Example using FastAPI. Adapt to your framework.
#
# from fastapi import APIRouter, Depends, Request
# from fastapi.responses import RedirectResponse
#
# router = APIRouter()
#
#
# def require_portal_session(request: Request):
#     """
#     Your existing auth dependency — raises 401 / redirects to login if
#     the user has no valid portal session.
#     Replace with your actual implementation.
#     """
#     raise NotImplementedError("Replace with your auth dependency")
#
#
# @router.get("/launch-notebook")
# async def launch_notebook(
#     request: Request,
#     next: str = "",               # Hub appends ?next=<hub-internal-url> on cookie expiry
#     current_user = Depends(require_portal_session),
# ):
#     """
#     Happy-path (user clicks "Launch Notebook" button):
#       1. Portal backend ensures Hub user + server exist.
#       2. Generates an HMAC-signed ticket (no Hub API call needed).
#       3. Returns redirect_url to the portal UI.
#       4. Portal UI redirects browser to redirect_url.
#       5. Hub validates ticket, sets session cookie, redirects to notebook.
#
#     Revisit-path (Hub session cookie expired, user visits bookmarked URL):
#       Hub redirects to PORTAL_LAUNCH_URL?next=<hub-internal-url>.
#       This endpoint receives that `next` value, generates a ticket that
#       includes it, and redirects back to the Hub.  After the Hub sets the
#       session cookie it follows `next`, completing the OAuth2 flow and
#       landing the user on their original bookmarked page.
#     """
#     username = current_user.username
#
#     await ensure_user(username)
#     await ensure_server_running(username)
#
#     # `next` is the Hub-internal URL to return to after login.
#     # For the happy path it is empty — default to the user's notebook home.
#     # For the revisit path the Hub provides it; pass it through opaquely.
#     ticket_data = create_launch_ticket(username, next_path=next)
#
#     # redirect_url is fully constructed; just send the browser there.
#     return RedirectResponse(url=ticket_data['redirect_url'], status_code=302)
#
#
# @router.post("/logout-notebook")
# async def logout_notebook(
#     request: Request,
#     current_user = Depends(require_portal_session),
# ):
#     """
#     Call from your portal logout flow.
#     Optionally stops the notebook server to free resources immediately
#     (otherwise the idle culler handles it after 1 hour).
#     """
#     username = current_user.username
#
#     # Optionally stop the server immediately on portal logout:
#     # await stop_server(username)
#
#     return {"status": "ok"}


const axios = require('axios');
const config = require('config');
const crypto = require('crypto');

const api = axios.create({
  baseURL: config.get('jupyterhub.api_url'),
  headers: { Authorization: `token ${config.get('jupyterhub.auth_token')}` },
});

// =============================================================================
// Users
// =============================================================================

/**
 * Create the JupyterHub user if they don't exist.
 * Safe to call on every launch — 409 Conflict is silently ignored.
 *
 * @param {string} username
 */
async function ensureUser(username) {
  try {
    await api.post(`/users/${encodeURIComponent(username)}`);
  } catch (err) {
    if (err.response?.status === 409) return; // already exists
    throw err;
  }
}

// =============================================================================
// Launch tickets  (browser authentication — replaces Hub API tokens in URLs)
// =============================================================================
//
// Why not Hub API tokens?
//   JupyterHub 2.x single-user servers use OAuth2 for browser auth. Sending
//   a Hub API token in a redirect URL (?token=...) hits the single-user
//   server's OAuth2 proxy, which has no Hub session yet and discards the
//   token, resulting in 403. HMAC tickets are validated by the Hub's own
//   handler *before* OAuth2 starts, so they reliably establish a session.
//
// The shared secret (hub.ticket_secret) must be set identically in:
//   - This portal backend's config
//   - The Hub container's environment (jupyterhub_config.py reads it)
//

/**
 * Generate a short-lived HMAC-signed ticket for browser authentication.
 * Does NOT make any Hub API calls — safe to call on every launch.
 *
 * @param {string} username
 * @param {string} [nextPath='']   Hub-internal URL to redirect to after login
 * @param {number} [maxAge=300]    ticket validity in seconds (informational)
 * @returns {{ redirect_url: string, ticket: string, username: string, ts: number, next: string }}
 */
function createLaunchTicket(username, nextPath = '') {
  const ticketSecret = config.get('jupyterhub.ticket_secret');
  const baseUrl = config.get('jupyterhub.base_url');

  const ts = Math.floor(Date.now() / 1000);
  const next = nextPath || `/user/${username}/`;

  const ticket = crypto
    .createHmac('sha256', ticketSecret)
    .update(`${username}:${ts}`)
    .digest('hex');

  const params = new URLSearchParams({
    ticket, username, ts, next,
  }).toString();

  return {
    redirect_url: `${baseUrl}/hub/portal-login?${params}`,
    ticket,
    username,
    ts,
    next,
  };
}

// =============================================================================
// Servers
// =============================================================================

/**
 * Start the user's default server if it isn't already running.
 *
 * Returns true if a new spawn was triggered, false if already running.
 * The server may still be spawning when this returns — the Hub proxy
 * will hold the user's browser connection open until it's ready.
 *
 * @param {string} username
 * @returns {Promise<boolean>}
 */
async function ensureServerRunning(username) {
  try {
    const { status } = await api.post(`/users/${encodeURIComponent(username)}/server`);
    // 201 The user's notebook server has started
    // 202 The user's notebook named-server has not yet started, but has been requested

    return status === 201;
  } catch (err) {
    if (err.response?.status === 400 || err.response?.status === 409) return false;
    throw err;
  }
}

/**
 * Returns the user's default server dict if running, or null if not.
 * Useful for showing a 'your notebook is starting...' UI in the portal.
 *
 * @param {string} username
 * @returns {Promise<object|null>}
 */
async function getServerStatus(username) {
  try {
    const { data } = await api.get(`/users/${encodeURIComponent(username)}`);
    return data?.servers?.[''] ?? null; // '' = default server
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Stop the user's server. Their files (in the volume) are not affected.
 *
 * @param {string} username
 */
async function stopServer(username) {
  try {
    await api.delete(`/users/${encodeURIComponent(username)}/server`);
  } catch (err) {
    if (err.response?.status === 404) return; // already stopped
    throw err;
  }
}

module.exports = {
  ensureUser,
  createLaunchTicket,
  ensureServerRunning,
  getServerStatus,
  stopServer,
};

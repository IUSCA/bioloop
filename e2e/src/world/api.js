const fs = require('node:fs');
const path = require('node:path');

/**
 * A small authenticated client for the API, used by the world builder and by the parity
 * assertion. Specs reach the API through Playwright's own request fixture instead; this one
 * exists so the builder can run outside a test.
 *
 * @see docs/design/groups/e2e-test-plan.md — How it is built
 */

const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3030';

/**
 * A session token for a username, from the development login route.
 *
 * The route takes no credential and is registered only in a recognised development mode —
 * localhost, docker, or ci — which is the whole of its safety.
 *
 * @see docs/guides/dev-servers.md — Logging in without CAS
 */
async function signIn(username) {
  const res = await fetch(`${API_BASE}/auth/test_login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    throw new Error(
      `test_login failed for '${username}': ${res.status}. `
      + 'Is the API up, and is it running in a development mode?',
    );
  }
  const body = await res.json();
  return { token: body.token, profile: body.profile };
}

/** An API client bound to one token. Every method throws on a non-2xx, naming the call. */
function clientFor(token) {
  async function request(method, url, body) {
    const res = await fetch(`${API_BASE}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 400)}`);
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    patch: (url, body) => request('PATCH', url, body),
    put: (url, body) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
    /**
     * Status and body together, without throwing.
     *
     * For the assertions that are about what a refusal *says* rather than that it refused —
     * C3 checks that rejecting the wrong person's invitation does not name the address it was
     * sent to, and that claim can only be made against the body.
     */
    raw: async (method, url, body) => {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.text() };
    },
    /** The raw status, for asserting a refusal rather than following a happy path. */
    status: async (method, url, body) => {
      const res = await fetch(`${API_BASE}${url}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return res.status;
    },
  };
}

/**
 * Database settings, read from `api/.env`.
 *
 * Parsed here rather than through `dotenv` so the package carries no dependency for fifteen
 * lines of work, and read from the API's own file so the two cannot disagree about which
 * database is in play.
 */
function databaseConfig() {
  const envPath = path.join(__dirname, '..', '..', '..', 'api', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Cannot read database settings: ${envPath} does not exist.`);
  }
  const values = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return {
    host: values.DATABASE_HOST,
    port: Number(values.DATABASE_PORT),
    user: values.DATABASE_USER,
    password: values.DATABASE_PASSWORD,
    database: values.DATABASE_DB,
  };
}

module.exports = {
  API_BASE, signIn, clientFor, databaseConfig,
};

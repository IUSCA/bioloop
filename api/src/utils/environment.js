const config = require('config');

/**
 * Deployment modes in which surfaces that must never reach production are allowed to exist.
 *
 * The list is an allowlist rather than a check for "not production", and that direction is
 * the whole point. A deployment whose NODE_ENV is misspelled — `prod` rather than
 * `production` — loads no environment config file, so any rule phrased as "not production"
 * holds and the surface appears. Phrased this way the same misspelling closes the surface
 * instead, and the failure is a developer noticing the dev login has gone rather than an
 * unauthenticated login route on a public host.
 *
 * The three entries are the environments that actually exist: `localhost` and `docker` have
 * their own config files, and `ci` is set by docker-compose-e2e.yml for the end-to-end stack.
 * `test` is deliberately absent, because Jest sets it and a test run needs neither surface.
 */
const DEVELOPMENT_MODES = Object.freeze(['localhost', 'docker', 'ci']);

/**
 * The deployment this process is running in.
 *
 * Set from NODE_ENV by config/custom-environment-variables.json, and stated again in each
 * environment's own config file. There is no default: an unset NODE_ENV throws here at
 * startup, which is the correct outcome, because every other answer is a guess about which
 * host the process is on.
 *
 * @returns {string} one of `production`, `test`, `localhost`, `docker`, `ci`
 */
function mode() {
  return config.get('mode');
}

/**
 * Whether this process may expose surfaces that are unsafe outside development.
 *
 * Two things are gated on it: the Swagger UI, which publishes the shape of every endpoint,
 * and `POST /auth/test_login`, which issues a session for any named account with no
 * credential at all. The absence of the route is the entire protection, so this predicate is
 * the entire protection, and it fails closed for an unrecognised mode.
 *
 * @returns {boolean}
 */
function isDevelopment() {
  return DEVELOPMENT_MODES.includes(mode());
}

module.exports = { DEVELOPMENT_MODES, mode, isDevelopment };

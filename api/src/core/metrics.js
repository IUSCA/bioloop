const promBundle = require('express-prom-bundle');
const client = require('prom-client');
const config = require('config');

const CLIENT_CLOSED_REQUEST_CODE = 499;

function normalizeStatusCode(res) {
  if (res.headersSent) {
    const code = res.status_code || res.statusCode;
    // collapse all codes starting with 2 to '2xx'
    if (code >= 200 && code < 300) {
      return '2xx';
    }
    // collapse all codes starting with 3 to '3xx'
    if (code >= 300 && code < 400) {
      return '3xx';
    }
    // collapse all codes starting with 4 to '4xx'
    // if (code >= 400 && code < 500) {
    //   return '4xx';
    // }
    // collapse all codes starting with 5 to '5xx'
    // if (code >= 500 && code < 600) {
    //   return '5xx';
    // }
    return `${code}`;
  }
  return CLIENT_CLOSED_REQUEST_CODE;
}

const metricsMiddleware = promBundle({
  autoregister: !config.get('cluster.enabled'),
  includeMethod: true,
  includePath: true,
  formatStatusCode: normalizeStatusCode,
  // Return the path of the express route (i.e. /projects/:username/datasets/:id
  // or /datasets/:id) instead of the full URL (i.e. /projects/ben/datasets/1234)")
  normalizePath: (req) => req.baseUrl + (req.route?.path || req.path),
  promClient: {
    collectDefaultMetrics: {
    },
  },
});

/**
 * Counter metric to track the total number of failed authentication attempts.
 *
 * This metric is labeled with the following:
 * - `auth_method`: The authentication method used (e.g., 'password', 'oauth').
 * - `reason`: The reason for the failure (e.g., 'invalid_credentials', 'account_locked').
 * - `client_id`: The identifier for the client making the request (e.g., 'web', 'cli').
 *
 * Example usage:
 *
 * ```javascript
 * authFailures.inc({
 *   auth_method: 'password',
 *   reason: 'invalid_credentials',
 *   client_id: 'web',
 * });
 * ```
 */
const authFailures = new client.Counter({
  name: 'auth_failures_total',
  help: 'Total number of failed authentication attempts',
  labelNames: ['auth_method', 'reason', 'client_id'],
});

module.exports = {
  metricsMiddleware,
  authFailures,
};

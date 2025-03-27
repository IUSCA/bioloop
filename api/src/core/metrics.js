const promBundle = require('express-prom-bundle');

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

module.exports = {
  normalizeStatusCode,
  metricsMiddleware,
};

# Instrumentation

Instrumentation is the process of collecting and storing data about the performance of your application. This data can be used to identify performance bottlenecks, monitor the health of your application, and make informed decisions about how to improve performance.

`prom-client` is a popular library for instrumenting Node.js applications with Prometheus metrics. It provides a simple and efficient way to collect metrics and expose them for monitoring and alerting.

## Metrics Middleware

The `metricsMiddleware` is a middleware function provided by the `express-prom-bundle` library. It is responsible for collecting HTTP request metrics, such as response times, status codes, and request paths. These metrics are exposed in a format compatible with Prometheus, enabling easy integration with monitoring systems.

### Configuration

The `metricsMiddleware` is configured in the `core/metrics.js` file. Key configurations include:

- **Autoregister**: Automatically registers metrics unless clustering is enabled.
- **Include Method**: Captures the HTTP method (e.g., GET, POST).
- **Include Path**: Captures the request path.
- **Normalize Path**: Normalizes paths to avoid high cardinality (e.g., `/users/:id` instead of `/users/123`).
- **Buckets**: Defines histogram buckets for response times, ranging from 30ms to 30s.

### Metrics Collected

The middleware collects the following metrics:
- **HTTP Request Duration**: Measures the time taken to process requests in a histogram format.
- **HTTP Status Codes**: Aggregates status codes into categories (e.g., `2xx`, `4xx`).
- **Request Paths**: Tracks metrics per normalized path.

```plaintext
# HELP http_request_duration_seconds duration histogram of http responses labeled with: status_code, method, path
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.03",status_code="2xx",method="GET",path="/datasets/"} 2
http_request_duration_seconds_bucket{le="0.1",status_code="2xx",method="GET",path="/datasets/"} 2
http_request_duration_seconds_bucket{le="0.3",status_code="2xx",method="GET",path="/datasets/"} 2
http_request_duration_seconds_bucket{le="1",status_code="2xx",method="GET",path="/datasets/"} 2
http_request_duration_seconds_bucket{le="3",status_code="2xx",method="GET",path="/datasets/"} 2
http_request_duration_seconds_bucket{le="10",status_code="2xx",method="GET",path="/datasets/"} 2
http_request_duration_seconds_bucket{le="30",status_code="2xx",method="GET",path="/datasets/"} 2
http_request_duration_seconds_bucket{le="+Inf",status_code="2xx",method="GET",path="/datasets/"} 2
http_request_duration_seconds_sum{status_code="2xx",method="GET",path="/datasets/"} 0.038533292
http_request_duration_seconds_count{status_code="2xx",method="GET",path="/datasets/"} 2
```

Default metrics about node.js process are also collected. To view all metrics:

```bash
api> curl locahost:9999/metrics > metrics.prom
```

### Usage

The middleware is added to the Express application in `app.js`:

```javascript
const { metricsMiddleware } = require('./core/metrics');
app.use(metricsMiddleware);
```

This ensures that all incoming requests are automatically instrumented.

## Custom Metrics

`core/metrics.js`

```javascript
const authFailures = new client.Counter({
  name: 'auth_failures_total',
  help: 'Total number of failed authentication attempts',
  labelNames: ['auth_method', 'reason', 'client_id'],
});
```

Add your custom metric to the `metrics.js` file. This example creates a counter metric to track the total number of failed authentication attempts. You can define custom labels to provide additional context for the metric. This metric will be automatically registered and sent to the Prometheus server on every scrape.

### Include the Metric in Your Code

`services/authService.js`

```javascript
const metrics = require('../core/metrics');

function authenticateUser(username, password) {
  if (!isValidCredentials(username, password)) {
    metrics.authFailures.inc({ auth_method: 'password', reason: 'invalid_credentials', client_id: 'web' });
    throw new Error('Invalid credentials');
  }
}
```

## Clustered Metrics Aggregation

In a clustered environment, metrics from all worker processes are aggregated in the master process. This ensures that metrics are consistent and accessible from a single endpoint.

### Implementation

The aggregation is implemented in `cluster.js`:

- **Master Process**: Exposes the `/metrics` endpoint on a separate port for Prometheus to scrape aggregated metrics.
- **Worker Processes**: Collect metrics locally and send them to the master process.

Example configuration in `cluster.js`:

```javascript
const promBundle = require('express-prom-bundle');
metricsApp.use('/metrics', promBundle.clusterMetrics());
```

Without this setup, metrics would be fragmented across worker processes, making it difficult to monitor the entire system.

### Benefits

- Centralized metrics collection in clustered environments.
- Simplifies monitoring and alerting.
- Ensures accurate and consistent metrics across all processes.
# Cluster Management

The `manage_cluster` function is a utility for managing a cluster of worker processes in a Node.js application. It provides features such as scaling, restart limits, and graceful shutdowns, making it easier to build robust and scalable applications.

This system is designed to efficiently manage multiple worker processes in a Node.js application. It leverages the `node:cluster` module to distribute workloads across available CPU cores, ensuring optimal utilization of system resources. This feature is particularly useful for high-performance applications that need to handle a large number of concurrent requests.

Without this system, the application would run as a single process, potentially underutilizing multi-core CPUs and becoming a bottleneck under heavy load.

## Overview

The `manage_cluster` function allows you to:

- Run a master process to manage worker processes.
- Define custom logic for both master and worker processes.
- Automatically restart workers within configurable limits.
- Gracefully shut down workers on receiving termination signals.

## Configuration Options

The function accepts an options object with the following properties:

- **`master`**: A callback function to execute in the master process (optional).
- **`worker`**: A callback function to execute in each worker process (required).
- **`beforeApplicationFork`**: A callback function to execute before forking workers (optional).
- **`count`**: The number of worker processes to spawn (default: 2).
- **`max_restarts`**: Maximum number of worker restarts allowed within the interval (default: 3).
- **`max_restarts_interval`**: Time interval (in milliseconds) for the restart limit (default: 10000).
- **`grace`**: Grace period (in milliseconds) for workers to shut down gracefully (default: 5000).
- **`signals`**: List of signals to listen for to trigger shutdown (default: `['SIGINT', 'SIGTERM']`).

## Example Usage

```javascript
const manage_cluster = require('./core/cluster-manager');

manage_cluster({
  master: () => console.log('Master process running'),
  worker: () => setInterval(() => console.log('Worker process running'), 1000),
  count: 4,
  max_restarts: 5,
  max_restarts_interval: 15000,
  grace: 3000,
  signals: ['SIGINT', 'SIGTERM', 'SIGHUP'],
});
```

In this example:
- The master process logs a message when it starts.
- Each worker process logs a message every second.
- The cluster spawns 4 workers and allows up to 5 restarts within a 15-second interval.
- Workers are given 3 seconds to shut down gracefully when a termination signal is received.

## Metrics Integration

The master process can also expose aggregated metrics using the `prom-client` library. This is demonstrated in the `cluster.js` file, where a metrics server is set up to listen on a configurable port.

Refer to the `cluster.js` file for a complete example of integrating metrics with the cluster manager.


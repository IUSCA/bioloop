/* eslint-disable no-console */
const path = require('path');
// __basedir is the path of root directory
// has same value when used in any js file in this project
global.__basedir = path.join(__dirname, '..');
require('dotenv-safe').config();
const config = require('config');

const express = require('express');
const promBundle = require('express-prom-bundle');
const promClient = require('prom-client');
const manage_cluster = require('./core/cluster-manager');

function master() {
  const metricsApp = express();
  metricsApp.use('/metrics', promBundle.clusterMetrics());

  const port = config.get('metrics.cluster.port');
  // const metricsServer =
  metricsApp.listen(port, () => {
    console.log(`Aggregated metrics listening on : http://localhost:${port}/metrics`);
  });

  // function shutdown() {
  //   return new Promise((resolve) => {
  //     metricsServer.close(() => {
  //       console.log('Metrics server closed');
  //       resolve();
  //     });
  //   });
  // }
  // // Attach shutdown handler to the master process
  // return shutdown;
}

function worker() {
  // eslint-disable-next-line no-new
  new promClient.AggregatorRegistry(); // Required for metrics
  // eslint-disable-next-line global-require
  require('./index'); // Business logic
}

manage_cluster({
  master,
  worker,
  count: config.get('cluster.max_workers'),
  max_restarts: config.get('cluster.max_restarts'),
  max_restarts_interval: config.get('cluster.max_restarts_interval'),
  grace: config.get('cluster.grace'),
  signals: ['SIGTERM', 'SIGINT'],
});

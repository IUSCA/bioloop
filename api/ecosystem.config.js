module.exports = [{
  script: 'src/index.js',
  name: 'api',
  exec_mode: 'cluster',
  instances: 2,
  exp_backoff_restart_delay: 100,
  max_restarts: 3,
  watch: false,
}, {
  script: 'src/scripts/notification_processor.js',
  name: 'notification_processor',
  exec_mode: 'fork',
  exp_backoff_restart_delay: 100,
  max_restarts: 3,
  watch: false,
}];

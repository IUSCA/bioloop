module.exports = [{
  script: 'src/index.js',
  name: 'secure_download_api',
  exec_mode: 'cluster',
  instances: 2,
  exp_backoff_restart_delay: 100,
  max_restarts: 3,
  watch: true,
}];

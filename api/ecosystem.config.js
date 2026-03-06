module.exports = [
  {
    script: 'src/index.js',
    name: 'api',
    exec_mode: 'cluster',
    instances: 2,
    exp_backoff_restart_delay: 100,
    max_restarts: 3,
    watch: false,
  },
  {
    name: 'notification-worker',
    script: 'src/notification/worker.js',
    exec_mode: 'fork', // ← MUST be fork, not cluster
    instances: 1, // ← MUST be 1 (cron runs here, must not duplicate)
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    env_production: {
      NODE_ENV: 'production',
    },
    // Worker gets same env as your API — shares the same .env file
  },

];

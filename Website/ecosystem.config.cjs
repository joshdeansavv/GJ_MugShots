module.exports = {
  apps: [
    {
      name: 'gj-api-server',
      script: './api-server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        HOST: '0.0.0.0'
      },
      error_file: '/tmp/gj-api-error.log',
      out_file: '/tmp/gj-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      restart_delay: 1000
    },
    {
      name: 'gj-vite-dev',
      script: 'npm',
      args: 'run dev',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development'
      },
      error_file: '/tmp/gj-vite-error.log',
      out_file: '/tmp/gj-vite-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      restart_delay: 1000
    }
  ]
};


// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'push-admin',
      script: 'npx',
      args: 'wrangler pages dev dist --persist-to /home/user/d1_data --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'alarm-cron',
      script: 'scripts/alarm-cron.js',
      cwd: '/home/user/webapp',
      env: {
        SERVER_URL: 'http://localhost:3000'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      restart_delay: 5000,
      autorestart: true
    }
  ]
}

#!/bin/sh

# Starting cron (as root) to run logrotate (as non-root) once a day
crond

# Starting pm2 under non-root user
# Using `exec` to pass signals from shell to the binary
exec su-exec ${name}:${name} pm2-runtime /app/airseeker-service.config.js --env production

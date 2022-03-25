/* eslint-disable functional/immutable-data */
module.exports = {
  apps: [
    {
      name: 'airseeker',
      script: './dist/src/main.js',
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};

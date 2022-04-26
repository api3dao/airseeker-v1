/* eslint-disable functional/immutable-data */
module.exports = {
  apps: [
    {
      name: 'airseeker',
      script: './dist/index.js',
      kill_timeout: 10_000,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};

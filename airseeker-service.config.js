/* eslint-disable functional/immutable-data */
module.exports = {
  apps: [
    {
      name: 'airseeker',
      script: './src/main.js',
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

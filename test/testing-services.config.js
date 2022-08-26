/* eslint-disable functional/immutable-data */
module.exports = {
  apps: [
    {
      name: 'mock-server',
      script: 'ts-node ./test/server/server.ts',
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'ethereum-node',
      script: 'hardhat node',
    },
  ],
};

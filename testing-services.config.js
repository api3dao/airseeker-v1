/* eslint-disable functional/immutable-data */
module.exports = {
  apps: [
    {
      name: 'mock-server',
      script: 'ts-node ./test/server/server.ts',
      env: {
        NODE_ENV: 'development',
      },
      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/ethereum-node.log',
      out_file: 'logs/ethereum-node.log',
      merge_logs: true,
    },
    {
      name: 'ethereum-node',
      script: 'hardhat node',
    },
  ],
};

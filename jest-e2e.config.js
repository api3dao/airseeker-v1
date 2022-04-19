const config = require('./jest.config');

/* eslint-disable functional/immutable-data */
module.exports = {
  ...config,
  // Add custom settings below
  name: 'e2e',
  displayName: 'e2e',
  testMatch: ['**/?(*.)+(feature).[tj]s?(x)'],
};

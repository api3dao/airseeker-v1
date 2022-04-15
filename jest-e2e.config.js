/* eslint-disable functional/immutable-data */
const config = require('./jest.config');

module.exports = {
  ...config,
  // Add custom settings below
  name: 'e2e',
  displayName: 'e2e',
  testMatch: ['**/?(*.)+(feature).[tj]s?(x)'],
};

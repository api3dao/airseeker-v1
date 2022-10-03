const config = require('./jest.config');

// eslint-disable-next-line functional/immutable-data
module.exports = {
  ...config,
  displayName: 'e2e',
  testMatch: ['**/?(*.)+(feature).[t]s?(x)'],
};

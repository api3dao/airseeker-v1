const config = require('./jest.config');

// eslint-disable-next-line functional/immutable-data
module.exports = {
  ...config,
  displayName: 'unit',
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
};

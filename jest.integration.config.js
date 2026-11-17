// Integration suite: full Express app + real MongoDB via
// mongodb-memory-server. Requires outbound network access to download the
// mongod binary on first run (see README.md, "Running the tests").
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/**/*.test.js'],
  globalSetup: './tests/globalSetup.js',
  globalTeardown: './tests/globalTeardown.js',
  testTimeout: 30000,
  verbose: true,
};

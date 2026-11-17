// Default Jest config: pure-logic unit tests only — no database required,
// so this always runs regardless of network/sandbox restrictions.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.js'],
  testTimeout: 15000,
  verbose: true,
};

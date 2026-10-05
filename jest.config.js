export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest'
  },
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: true,
  testTimeout: 20000
};

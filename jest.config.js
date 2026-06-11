// next/jest gives us SWC-based TS/JSX transform, CSS module mocking, and
// automatic alias resolution from tsconfig.json paths.
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Path to the Next.js app — enables loading next.config.js and .env files.
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: 'jsdom',

  // Runs after the test env is set up so we can extend `expect`
  // with @testing-library/jest-dom matchers (toBeInTheDocument, etc.).
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],

  // Match the tsconfig.json "@/*" path alias.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  // Coverage gates apply to unit-testable library logic only. React pages and
  // components, plus thin API route handlers, are exercised via integration/e2e
  // tests (see tests/integration) rather than unit tests, so they are kept out
  // of the coverage scope to keep the gate meaningful instead of measuring UI.
  collectCoverageFrom: ['lib/**/*.{ts,tsx}', '!**/*.d.ts', '!**/node_modules/**'],

  // Coverage gates — bump these up as the test suite grows.
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },

  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
};

module.exports = createJestConfig(customJestConfig);

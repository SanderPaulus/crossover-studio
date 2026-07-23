import { defineConfig } from 'vitest/config';

// Standalone test config: the lib is framework-free, so tests run in a plain
// node environment without the React plugin (which avoids Vite version-type
// clashes between the app build and the test runner).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

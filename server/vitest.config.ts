import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for server tests.
 *
 * @see https://vitest.dev/config/
 */
export default defineConfig({
  test: {
    // Use Node environment for server-side code
    environment: 'node',

    // Test file patterns
    include: ['src/**/*.test.ts'],

    // Coverage configuration (optional, can be enabled later)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/index.ts', // Server entry point
      ],
    },

    // Test timeout (can be overridden per test)
    testTimeout: 10000,

    // Globals (optional - enables `describe`, `it`, etc. without imports)
    globals: false,
  },
});

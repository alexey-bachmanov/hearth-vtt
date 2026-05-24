import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for shared package tests.
 *
 * @see https://vitest.dev/config/
 */
export default defineConfig({
  test: {
    // Use Node environment — shared is environment-neutral and has no DOM deps
    environment: 'node',

    // Test file patterns
    include: ['src/**/*.test.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/index.ts', // Barrel re-export only
      ],
    },

    // Test timeout (can be overridden per test)
    testTimeout: 10000,

    // Globals disabled — use explicit imports from 'vitest'
    globals: false,
  },
});

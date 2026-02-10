import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for client tests.
 *
 * For testing pure TypeScript/JavaScript logic without Svelte components.
 * When you need to test Svelte components, we'll add @testing-library/svelte
 * or similar testing utilities.
 *
 * @see https://vitest.dev/config/
 */
export default defineConfig({
  test: {
    // Use happy-dom for browser-like environment (lighter and faster than jsdom)
    environment: 'happy-dom',

    // Test file patterns
    include: ['src/**/*.test.ts'],

    // Coverage configuration (optional, can be enabled later)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.svelte'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/main.ts', // Client entry point
      ],
    },

    // Test timeout (can be overridden per test)
    testTimeout: 10000,

    // Globals (optional - enables `describe`, `it`, etc. without imports)
    globals: false,
  },
});

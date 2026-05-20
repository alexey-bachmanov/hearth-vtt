import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Vitest configuration for client tests.
 *
 * Merges the existing vite.config.ts (which already includes the Svelte plugin)
 * with vitest-specific settings. This avoids vite version type conflicts that
 * occur when importing @sveltejs/vite-plugin-svelte directly here.
 *
 * @see https://vitest.dev/config/
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    // Force Vite to use browser-condition exports when resolving packages.
    // Without this, the `svelte` package resolves to index-server.js (SSR),
    // which throws `mount(...) is not available on the server` in component tests.
    resolve: {
      conditions: ['browser'],
    },
    test: {
      // Use happy-dom for browser-like environment (lighter and faster than jsdom)
      environment: 'happy-dom',

      // Test file patterns
      include: ['src/**/*.test.ts'],

      // Runs before each test file — extends expect with @testing-library/jest-dom matchers
      setupFiles: ['src/test-setup.ts'],

      // Coverage configuration
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.ts', 'src/**/*.svelte'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.d.ts',
          'src/main.ts', // Client entry point
          'src/test-setup.ts',
        ],
      },

      // Test timeout (can be overridden per test)
      testTimeout: 10000,

      // Globals disabled — import { describe, it, expect } from 'vitest' explicitly
      globals: false,
    },
  }),
);

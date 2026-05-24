import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration.
 *
 * E2E tests require a running server (server + client bundle).
 * See e2e/README.md for instructions on running E2E tests locally.
 *
 * Run with: npm run e2e
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * Automatically start the server before running E2E tests.
   * Adjust the command to match your local dev setup.
   * Comment this section out if you are running the server manually.
   */
  // webServer: {
  //   command: 'npm run dev:server',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});

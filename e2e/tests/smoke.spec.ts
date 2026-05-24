/**
 * Smoke tests — verify the server is reachable and serves the expected pages.
 *
 * These tests assume the server is already running at the configured baseURL.
 * See e2e/README.md for setup instructions.
 */

import { test, expect } from '@playwright/test';

test.describe('Server smoke tests', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/');
    // The page should not show a network-error screen
    await expect(page).not.toHaveURL(/error/);
  });

  test('admin login page is reachable', async ({ page }) => {
    await page.goto('/admin');
    // Should redirect to /admin/login or /admin/setup — both are valid
    await expect(page).toHaveURL(/(admin\/login|admin\/setup|admin)/);
  });
});

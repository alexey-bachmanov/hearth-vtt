import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

// @testing-library/svelte cannot auto-detect vitest's afterEach when globals are
// disabled (globals: false in vitest.config.ts), so cleanup must be registered
// manually. Without this, rendered components accumulate across tests in the
// same file and queries like getByRole fail with "Found multiple elements".
afterEach(() => {
  cleanup();
});

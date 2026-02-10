import { describe, it, expect } from 'vitest';

/**
 * Example test suite for client
 *
 * This file demonstrates basic Vitest setup with happy-dom environment
 * and serves as a sanity check that the test infrastructure is working.
 *
 * Delete or replace this file as you add real tests.
 */
describe('Client test infrastructure', () => {
  it('should run basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toBe('hello');
    expect([1, 2, 3]).toHaveLength(3);
  });

  it('should have access to browser globals', () => {
    // happy-dom provides these
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
    expect(typeof navigator).toBe('object');
  });

  it('should support DOM manipulation', () => {
    const div = document.createElement('div');
    div.textContent = 'HearthVTT';
    expect(div.textContent).toBe('HearthVTT');
    expect(div.tagName).toBe('DIV');
  });

  it('should handle async operations', async () => {
    const promise = Promise.resolve('success');
    await expect(promise).resolves.toBe('success');
  });
});

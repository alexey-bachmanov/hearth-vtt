import { describe, it, expect } from 'vitest';

/**
 * Example test suite for server
 *
 * This file demonstrates basic Vitest setup and serves as a
 * sanity check that the test infrastructure is working.
 *
 * Delete or replace this file as you add real tests.
 */
describe('Server test infrastructure', () => {
  it('should run basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toBe('hello');
    expect([1, 2, 3]).toHaveLength(3);
  });

  it('should handle async operations', async () => {
    const promise = Promise.resolve('success');
    await expect(promise).resolves.toBe('success');
  });

  it('should support object matchers', () => {
    const obj = { name: 'HearthVTT', version: '0.1.0' };
    expect(obj).toEqual({ name: 'HearthVTT', version: '0.1.0' });
    expect(obj).toHaveProperty('name');
    expect(obj.name).toBe('HearthVTT');
  });
});

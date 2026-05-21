import { describe, it, expect } from 'vitest';
import { parseTrustProxy } from './server.js';

describe('parseTrustProxy', () => {
  it('returns false when value is undefined (no env var set)', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
  });

  it('returns false for "false" (explicit opt-out)', () => {
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('returns false for empty string (falsy)', () => {
    expect(parseTrustProxy('')).toBe(false);
  });

  it('returns true for "true" (trust all proxies)', () => {
    expect(parseTrustProxy('true')).toBe(true);
  });

  it('returns 1 (number) for "1" (single hop)', () => {
    expect(parseTrustProxy('1')).toBe(1);
  });

  it('returns 2 (number) for "2" (two hops)', () => {
    expect(parseTrustProxy('2')).toBe(2);
  });

  it('returns the string "10.0.0.1" for a single IP', () => {
    expect(parseTrustProxy('10.0.0.1')).toBe('10.0.0.1');
  });

  it('returns an array for comma-separated IPs', () => {
    expect(parseTrustProxy('10.0.0.1,10.0.0.2')).toEqual([
      '10.0.0.1',
      '10.0.0.2',
    ]);
  });

  it('trims whitespace in comma-separated IPs', () => {
    expect(parseTrustProxy('10.0.0.1, 10.0.0.2')).toEqual([
      '10.0.0.1',
      '10.0.0.2',
    ]);
  });

  it('returns string "1.5" for a non-integer number string', () => {
    expect(parseTrustProxy('1.5')).toBe('1.5');
  });
});

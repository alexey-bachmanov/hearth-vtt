import { describe, it, expect } from 'vitest';
import { parseRoute } from './routes.js';

// ---------------------------------------------------------------------------
// /join/:token routes
// ---------------------------------------------------------------------------

describe('parseRoute() — /join/:token', () => {
  it('returns join with token for /join/abc123', () => {
    const route = parseRoute('/join/abc123');
    expect(route).toStrictEqual({ type: 'join', token: 'abc123' });
  });

  it('handles hyphens and underscores in the token', () => {
    const route = parseRoute('/join/abc-123_XYZ');
    expect(route).toStrictEqual({ type: 'join', token: 'abc-123_XYZ' });
  });

  it('returns not-logged-in for /join/ (no token segment)', () => {
    const route = parseRoute('/join/');
    expect(route).toStrictEqual({ type: 'not-logged-in' });
  });
});

// ---------------------------------------------------------------------------
// /play routes
// ---------------------------------------------------------------------------

describe('parseRoute() — /play', () => {
  it('returns play for exact /play', () => {
    expect(parseRoute('/play')).toStrictEqual({ type: 'play' });
  });

  it('returns play for /play/ (trailing slash stripped)', () => {
    expect(parseRoute('/play/')).toStrictEqual({ type: 'play' });
  });
});

// ---------------------------------------------------------------------------
// /admin routes
// ---------------------------------------------------------------------------

describe('parseRoute() — /admin', () => {
  it('returns admin for exact /admin', () => {
    expect(parseRoute('/admin')).toStrictEqual({ type: 'admin' });
  });

  it('returns admin for /admin/ (trailing slash)', () => {
    expect(parseRoute('/admin/')).toStrictEqual({ type: 'admin' });
  });

  it('returns admin-setup for /admin/setup', () => {
    expect(parseRoute('/admin/setup')).toStrictEqual({ type: 'admin-setup' });
  });

  it('returns admin-login for /admin/login', () => {
    expect(parseRoute('/admin/login')).toStrictEqual({ type: 'admin-login' });
  });

  it('returns not-logged-in for unrecognized /admin/unknown', () => {
    expect(parseRoute('/admin/unknown')).toStrictEqual({ type: 'not-logged-in' });
  });
});

// ---------------------------------------------------------------------------
// Fallback / not-logged-in routes
// ---------------------------------------------------------------------------

describe('parseRoute() — fallback', () => {
  it('returns not-logged-in for root /', () => {
    expect(parseRoute('/')).toStrictEqual({ type: 'not-logged-in' });
  });

  it('returns not-logged-in for empty string', () => {
    expect(parseRoute('')).toStrictEqual({ type: 'not-logged-in' });
  });

  it('returns not-logged-in for an unknown path', () => {
    expect(parseRoute('/unknown')).toStrictEqual({ type: 'not-logged-in' });
  });
});

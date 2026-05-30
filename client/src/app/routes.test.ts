import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseRoute,
  validateReturnTo,
  navigateWithReturnTo,
} from './routes.js';

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

  it('returns not-found for /join/ (no token segment)', () => {
    const route = parseRoute('/join/');
    expect(route).toStrictEqual({ type: 'not-found' });
  });
});

// ---------------------------------------------------------------------------
// / (splash)
// ---------------------------------------------------------------------------

describe('parseRoute() — / (splash)', () => {
  it('returns splash for root /', () => {
    expect(parseRoute('/')).toStrictEqual({ type: 'splash' });
  });

  it('returns splash for empty string (normalised to /)', () => {
    expect(parseRoute('')).toStrictEqual({ type: 'splash' });
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
// /play/login routes
// ---------------------------------------------------------------------------

describe('parseRoute() — /play/login', () => {
  it('returns play-login with returnTo=null when no search string', () => {
    expect(parseRoute('/play/login')).toStrictEqual({
      type: 'play-login',
      returnTo: null,
    });
  });

  it('returns play-login with returnTo when a valid returnTo is provided', () => {
    expect(
      parseRoute('/play/login', '?returnTo=%2Fplay%2Fcampaign-123'),
    ).toStrictEqual({
      type: 'play-login',
      returnTo: '/play/campaign-123',
    });
  });

  it('returns play-login with returnTo=null for an external returnTo', () => {
    expect(
      parseRoute('/play/login', '?returnTo=https%3A%2F%2Fevil.com'),
    ).toStrictEqual({
      type: 'play-login',
      returnTo: null,
    });
  });

  it('returns play-login with returnTo=null for a protocol-relative URL', () => {
    expect(parseRoute('/play/login', '?returnTo=%2F%2Fevil.com')).toStrictEqual(
      {
        type: 'play-login',
        returnTo: null,
      },
    );
  });
});

// ---------------------------------------------------------------------------
// /play/account
// ---------------------------------------------------------------------------

describe('parseRoute() — /play/account', () => {
  it('returns play-account', () => {
    expect(parseRoute('/play/account')).toStrictEqual({ type: 'play-account' });
  });
});

// ---------------------------------------------------------------------------
// /play/:campaignId
// ---------------------------------------------------------------------------

describe('parseRoute() — /play/:campaignId', () => {
  it('returns play-campaign for /play/campaign-abc', () => {
    expect(parseRoute('/play/campaign-abc')).toStrictEqual({
      type: 'play-campaign',
      campaignId: 'campaign-abc',
    });
  });

  it('returns play-campaign for /play/some-uuid-string', () => {
    expect(
      parseRoute('/play/550e8400-e29b-41d4-a716-446655440000'),
    ).toStrictEqual({
      type: 'play-campaign',
      campaignId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('does NOT treat /play/login as a campaign id', () => {
    expect(parseRoute('/play/login')).toStrictEqual({
      type: 'play-login',
      returnTo: null,
    });
  });

  it('does NOT treat /play/account as a campaign id', () => {
    expect(parseRoute('/play/account')).toStrictEqual({ type: 'play-account' });
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

  it('returns not-found for unrecognised /admin/unknown', () => {
    expect(parseRoute('/admin/unknown')).toStrictEqual({ type: 'not-found' });
  });
});

// ---------------------------------------------------------------------------
// Fallback / not-found routes
// ---------------------------------------------------------------------------

describe('parseRoute() — not-found fallback', () => {
  it('returns not-found for an unknown path', () => {
    expect(parseRoute('/unknown')).toStrictEqual({ type: 'not-found' });
  });

  it('returns not-found for /play/login/extra (too many segments)', () => {
    expect(parseRoute('/play/login/extra')).toStrictEqual({
      type: 'not-found',
    });
  });
});

// ---------------------------------------------------------------------------
// validateReturnTo
// ---------------------------------------------------------------------------

describe('validateReturnTo()', () => {
  it('accepts a simple pathname', () => {
    expect(validateReturnTo('/play/campaign-123')).toBe('/play/campaign-123');
  });

  it('accepts bare /', () => {
    expect(validateReturnTo('/')).toBe('/');
  });

  it('accepts a pathname with query string', () => {
    expect(validateReturnTo('/play/login?foo=bar')).toBe('/play/login?foo=bar');
  });

  it('rejects null', () => {
    expect(validateReturnTo(null)).toBeNull();
  });

  it('rejects undefined', () => {
    expect(validateReturnTo(undefined)).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateReturnTo('')).toBeNull();
  });

  it('rejects https:// URL', () => {
    expect(validateReturnTo('https://evil.com/path')).toBeNull();
  });

  it('rejects javascript: URL', () => {
    expect(validateReturnTo('javascript:alert(1)')).toBeNull();
  });

  it('rejects protocol-relative //evil.com', () => {
    expect(validateReturnTo('//evil.com')).toBeNull();
  });

  it('rejects URL with @ (user@host variant)', () => {
    expect(validateReturnTo('/path@evil.com')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// navigateWithReturnTo — unit-tests the URL it builds
// ---------------------------------------------------------------------------

describe('navigateWithReturnTo()', () => {
  // Capture pushState calls without touching a real browser
  const calls: string[] = [];
  const origPush = globalThis.history?.pushState;
  const origDispatch = globalThis.dispatchEvent;

  // Stub history.pushState and dispatchEvent for these tests
  beforeEach(() => {
    calls.length = 0;
    if (globalThis.history) {
      globalThis.history.pushState = (_: unknown, __: string, url: string) => {
        calls.push(url);
      };
    }
    globalThis.dispatchEvent = () => true;
  });

  afterEach(() => {
    if (origPush && globalThis.history) {
      globalThis.history.pushState = origPush;
    }
    globalThis.dispatchEvent = origDispatch;
  });

  it('navigates without returnTo when none is given', () => {
    navigateWithReturnTo('/play/login');
    expect(calls[0]).toBe('/play/login');
  });

  it('appends encoded returnTo for a valid pathname', () => {
    navigateWithReturnTo('/play/login', '/play/campaign-abc');
    expect(calls[0]).toBe('/play/login?returnTo=%2Fplay%2Fcampaign-abc');
  });

  it('omits returnTo when the value fails validation (external URL)', () => {
    navigateWithReturnTo('/play/login', 'https://evil.com');
    expect(calls[0]).toBe('/play/login');
  });

  it('omits returnTo when the value fails validation (protocol-relative)', () => {
    navigateWithReturnTo('/play/login', '//evil.com');
    expect(calls[0]).toBe('/play/login');
  });
});

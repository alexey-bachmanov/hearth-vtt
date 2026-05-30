/**
 * HttpClient CSRF injection tests.
 *
 * Verifies that the client automatically injects X-CSRF-Token on mutating
 * requests (POST, PATCH, DELETE) and omits it on GET requests.
 *
 * Also verifies that 401 with an active session triggers handleUnauthenticated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authState } from '../state/auth.svelte.js';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  authState.me = null;
  authState.csrfToken = null;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  authState.me = null;
  authState.csrfToken = null;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function make401Response(): Response {
  return new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'No session' } }),
    { status: 401 },
  );
}

// ---------------------------------------------------------------------------
// CSRF injection on mutating requests
// ---------------------------------------------------------------------------

describe('HttpClient CSRF injection', () => {
  it('injects X-CSRF-Token header on POST when csrfToken is set', async () => {
    authState.csrfToken = 'tok-123';
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse({
        accountId: 'a',
        username: 'u',
        csrfToken: 'tok-123',
        seats: [],
      }),
    );

    const { api } = await import('./http');
    await api.auth.logout().catch(() => {
      /* ok */
    });

    // logout is a POST
    const logoutCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => (url as string).includes('logout'));
    expect(logoutCall).toBeDefined();
    const headers = logoutCall![1]?.headers as Record<string, string>;
    expect(headers?.['X-CSRF-Token']).toBe('tok-123');
  });

  it('does not inject X-CSRF-Token on GET requests', async () => {
    authState.csrfToken = 'tok-123';
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse({
        accountId: 'a',
        username: 'u',
        csrfToken: 'tok-123',
        seats: [],
        mustChangePassword: false,
      }),
    );

    const { api } = await import('./http');
    await api.auth.me();

    const meCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => (url as string).includes('/me'));
    expect(meCall).toBeDefined();
    const headers = meCall![1]?.headers as Record<string, string>;
    expect(headers?.['X-CSRF-Token']).toBeUndefined();
  });

  it('does not inject X-CSRF-Token when csrfToken is null', async () => {
    authState.csrfToken = null;
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse({
        accountId: 'a',
        username: 'u',
        csrfToken: null,
        seats: [],
      }),
    );

    const { api } = await import('./http');
    await api.auth.logout().catch(() => {
      /* ok */
    });

    const logoutCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => (url as string).includes('logout'));
    const headers = logoutCall![1]?.headers as Record<string, string>;
    expect(headers?.['X-CSRF-Token']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 401 session expiry handling
// ---------------------------------------------------------------------------

describe('HttpClient 401 handling', () => {
  it('calls handleUnauthenticated when GET /me returns 401 with active session', async () => {
    // Set an active session so the 401 is treated as unexpected
    authState.me = { accountId: 'a', username: 'u', csrfToken: 'c', seats: [] };
    vi.mocked(fetch).mockResolvedValue(make401Response());

    const pushStateSpy = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => {});
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    const { api } = await import('./http');
    await api.auth.me().catch(() => {
      /* expected */
    });

    expect(authState.me).toBeNull();
    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      expect.stringContaining('/play/login'),
    );
  });

  it('does NOT call handleUnauthenticated when 401 occurs with no active session', async () => {
    authState.me = null;
    vi.mocked(fetch).mockResolvedValue(make401Response());

    const pushStateSpy = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => {});

    const { api } = await import('./http');
    await api.auth.me().catch(() => {
      /* expected — login form 401 */
    });

    expect(pushStateSpy).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { authState } from './auth.svelte.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMe() {
  return {
    accountId: 'acc-1',
    username: 'Testuser',
    seats: [
      {
        campaignId: 'camp-1',
        campaignName: 'Test Campaign',
        seatId: 'seat-1',
        role: 'player',
      },
    ],
  };
}

/** Reset module-level singleton state between tests. */
beforeEach(() => {
  authState.me = null;
  authState.loading = false;
  // @ts-expect-error — reset private field
  authState._loadingPromise = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('me is null', () => {
    expect(authState.me).toBeNull();
  });

  it('loading is false', () => {
    expect(authState.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadMe() — success
// ---------------------------------------------------------------------------

describe('loadMe() — success', () => {
  it('sets me on 200', async () => {
    const me = makeMe();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => me,
      }),
    );

    const result = await authState.loadMe();

    expect(result).toEqual(me);
    expect(authState.me).toEqual(me);
    expect(authState.loading).toBe(false);
  });

  it('passes credentials include', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeMe(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await authState.loadMe();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// loadMe() — 401
// ---------------------------------------------------------------------------

describe('loadMe() — 401', () => {
  it('sets me to null on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      }),
    );

    const result = await authState.loadMe();

    expect(result).toBeNull();
    expect(authState.me).toBeNull();
  });

  it('does not throw on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      }),
    );

    await expect(authState.loadMe()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadMe() — non-401 server error
// ---------------------------------------------------------------------------

describe('loadMe() — server error', () => {
  it('sets me to null on 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      }),
    );

    const result = await authState.loadMe();

    expect(result).toBeNull();
    expect(authState.me).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadMe() — network error
// ---------------------------------------------------------------------------

describe('loadMe() — network error', () => {
  it('returns null on fetch rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new Error('Network down')),
    );

    const result = await authState.loadMe();

    expect(result).toBeNull();
    expect(authState.me).toBeNull();
    expect(authState.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadMe() — concurrent calls
// ---------------------------------------------------------------------------

describe('loadMe() — concurrent calls', () => {
  it('shares a single in-flight request', async () => {
    const me = makeMe();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => me,
    });
    vi.stubGlobal('fetch', fetchMock);

    const [r1, r2] = await Promise.all([
      authState.loadMe(),
      authState.loadMe(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(me);
    expect(r2).toEqual(me);
  });
});

// ---------------------------------------------------------------------------
// logout()
// ---------------------------------------------------------------------------

describe('logout()', () => {
  it('clears me after logout', async () => {
    authState.me = makeMe();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 204,
      }),
    );

    // navigate() mutates history — stub it
    const { navigate } = await import('../app/routes.js');
    vi.spyOn({ navigate }, 'navigate').mockImplementation(() => {});

    await authState.logout();

    expect(authState.me).toBeNull();
  });

  it('calls POST /api/auth/logout with credentials include', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await authState.logout();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });

  it('clears me even if logout fetch fails', async () => {
    authState.me = makeMe();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new Error('Network down')),
    );

    await authState.logout();

    expect(authState.me).toBeNull();
  });
});

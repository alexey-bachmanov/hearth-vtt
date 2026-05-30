/**
 * PlayLoginPage component tests.
 *
 * Tests the /play/login form for:
 * - Initial render
 * - Successful login → updates authState and navigates
 * - Invalid credentials (401) error message
 * - Rate-limit (429) error message
 * - Forgot-password toggle
 * - returnTo redirect after login
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { authState } from '../../state/auth.svelte.js';
import PlayLoginPage from './PlayLoginPage.svelte';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMe() {
  return {
    accountId: 'acc-1',
    username: 'testplayer',
    csrfToken: 'csrf-abc',
    seats: [],
  };
}

function makeOkResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeErrorResponse(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let pushStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  authState.me = null;
  authState.csrfToken = null;
  // @ts-expect-error reset loading state
  authState.loading = false;
  global.fetch = vi.fn();
  pushStateSpy = vi
    .spyOn(window.history, 'pushState')
    .mockImplementation(() => {});
  vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  authState.me = null;
  authState.csrfToken = null;
});

// ---------------------------------------------------------------------------
// Initial render
// ---------------------------------------------------------------------------

describe('PlayLoginPage — initial render', () => {
  it('renders username and password fields', () => {
    render(PlayLoginPage, { props: { returnTo: null } });

    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders a Sign In button', () => {
    render(PlayLoginPage, { props: { returnTo: null } });

    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Successful login
// ---------------------------------------------------------------------------

describe('PlayLoginPage — successful login', () => {
  it('calls POST /api/auth/login with username and password', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse(makeMe()));
    global.fetch = fetchMock;

    render(PlayLoginPage, { props: { returnTo: null } });

    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'testplayer' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            username: 'testplayer',
            password: 'password123',
          }),
        }),
      );
    });
  });

  it('navigates to /play when returnTo is null', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse(makeMe()),
    );

    render(PlayLoginPage, { props: { returnTo: null } });

    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'testplayer' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/play');
    });
  });

  it('navigates to returnTo path after login', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse(makeMe()),
    );

    render(PlayLoginPage, { props: { returnTo: '/play/camp-abc' } });

    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'testplayer' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/play/camp-abc');
    });
  });

  it('sets authState.me after successful login', async () => {
    const me = makeMe();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse(me),
    );

    render(PlayLoginPage, { props: { returnTo: null } });

    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'testplayer' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(authState.me).toEqual(me);
    });
  });

  it('stores csrfToken from login response in authState', async () => {
    const me = makeMe();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse(me),
    );

    authState.csrfToken = null;

    render(PlayLoginPage, { props: { returnTo: null } });

    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'testplayer' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(authState.csrfToken).toBe('csrf-abc');
    });
  });
});

// ---------------------------------------------------------------------------
// Login failure — 401
// ---------------------------------------------------------------------------

describe('PlayLoginPage — 401 error', () => {
  it('shows invalid credentials error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeErrorResponse(401, {
        error: { code: 'INVALID_CREDENTIALS', message: 'Bad credentials' },
      }),
    );

    render(PlayLoginPage, { props: { returnTo: null } });

    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'bad' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Invalid username or password.',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Login failure — 429
// ---------------------------------------------------------------------------

describe('PlayLoginPage — 429 rate-limit', () => {
  it('shows rate-limit error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeErrorResponse(429, {
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      }),
    );

    render(PlayLoginPage, { props: { returnTo: null } });

    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'player' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Too many login attempts',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Validation — empty fields
// ---------------------------------------------------------------------------

describe('PlayLoginPage — validation', () => {
  it('shows error when fields are empty', async () => {
    render(PlayLoginPage, { props: { returnTo: null } });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Forgot password toggle
// ---------------------------------------------------------------------------

describe('PlayLoginPage — forgot password', () => {
  it('shows forgot password message when link is clicked', async () => {
    render(PlayLoginPage, { props: { returnTo: null } });

    fireEvent.click(screen.getByText('I forgot my password'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Ask them to reset');
    });
  });
});

/**
 * JoinPage component tests.
 *
 * The updated JoinPage supports two modes (register / login) and submits
 * ClaimInviteRequest to POST /api/auth/claim-invite via the HttpClient.
 *
 * Patterns:
 * - Mock global.fetch to control server responses
 * - Use vi.useFakeTimers() to prevent the post-success redirect from firing
 * - Use screen.findBy* for assertions after async fetch resolves
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { authState } from '../../state/auth.svelte.js';
import JoinPage from './JoinPage.svelte';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClaimResponse() {
  return {
    accountId: 'acc-1',
    campaignId: 'camp-1',
    seatId: 'seat-1',
    role: 'player',
    csrfToken: 'csrf-xyz',
  };
}

function makeMeResponse() {
  return {
    accountId: 'acc-1',
    username: 'testplayer',
    seats: [
      {
        campaignId: 'camp-1',
        campaignName: 'Test',
        seatId: 'seat-1',
        role: 'player',
      },
    ],
  };
}

function makeOkResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeErrorResponse(status: number, code = 'ERROR'): Response {
  return new Response(JSON.stringify({ error: { code, message: 'error' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Fill in the form fields and submit. */
async function fillAndSubmit({
  pin = '1234',
  username = 'player1',
  password = 'password123',
}: Partial<{ pin: string; username: string; password: string }> = {}) {
  if (pin) {
    fireEvent.input(screen.getByLabelText('PIN'), { target: { value: pin } });
  }
  if (username) {
    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: username },
    });
  }
  if (password) {
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: password },
    });
  }
  // Button label depends on mode — find any submit button
  fireEvent.click(
    screen.getByRole('button', { name: /Create account|Sign in & join/i }),
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  authState.me = null;
  authState.loading = false;
  // @ts-expect-error reset private field
  authState._loadingPromise = null;
  vi.stubGlobal('fetch', vi.fn());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  authState.me = null;
  authState.csrfToken = null;
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('JoinPage rendering', () => {
  it('renders the invite token in a readonly field', () => {
    render(JoinPage, { props: { token: 'my-invite-token' } });

    const tokenInput = screen.getByLabelText(
      'Invite Token',
    ) as HTMLInputElement;
    expect(tokenInput.value).toBe('my-invite-token');
    expect(tokenInput).toHaveAttribute('readonly');
  });

  it('renders PIN, Username, and Password fields', () => {
    render(JoinPage, { props: { token: 'abc' } });

    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('defaults to register mode (shows "New player" active)', () => {
    render(JoinPage, { props: { token: 'abc' } });

    expect(
      screen.getByRole('button', { name: /Create account/i }),
    ).toBeInTheDocument();
  });

  it('renders mode toggle buttons', () => {
    render(JoinPage, { props: { token: 'abc' } });

    expect(
      screen.getByRole('button', { name: 'New player' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Existing account' }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mode toggle
// ---------------------------------------------------------------------------

describe('JoinPage mode toggle', () => {
  it('switches to login mode when "Existing account" is clicked', async () => {
    render(JoinPage, { props: { token: 'abc' } });

    fireEvent.click(screen.getByRole('button', { name: 'Existing account' }));

    // Svelte 5 state updates are batched — use findByRole to wait for DOM update
    await screen.findByRole('button', { name: 'Sign in & join' });
  });

  it('switches back to register mode', async () => {
    render(JoinPage, { props: { token: 'abc' } });

    fireEvent.click(screen.getByRole('button', { name: 'Existing account' }));
    fireEvent.click(screen.getByRole('button', { name: 'New player' }));

    expect(
      screen.getByRole('button', { name: /Create account/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('JoinPage validation', () => {
  it('shows error when PIN is too short', async () => {
    render(JoinPage, { props: { token: 'abc' } });

    fireEvent.input(screen.getByLabelText('PIN'), { target: { value: '123' } });
    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'player1' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await screen.findByText(/Please enter a valid PIN/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows error when username is too short', async () => {
    render(JoinPage, { props: { token: 'abc' } });

    fireEvent.input(screen.getByLabelText('PIN'), {
      target: { value: '1234' },
    });
    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'a' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await screen.findByText(/Please enter a username/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows error when password is too short', async () => {
    render(JoinPage, { props: { token: 'abc' } });

    fireEvent.input(screen.getByLabelText('PIN'), {
      target: { value: '1234' },
    });
    fireEvent.input(screen.getByLabelText('Username'), {
      target: { value: 'player1' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await screen.findByText(/Please enter a password/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Successful claim
// ---------------------------------------------------------------------------

describe('JoinPage successful claim', () => {
  it('shows success message after successful claim', async () => {
    // First call: POST /api/auth/claim-invite
    // Second call: GET /api/auth/me (authState.loadMe)
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeClaimResponse()))
      .mockResolvedValueOnce(makeOkResponse(makeMeResponse()));

    render(JoinPage, { props: { token: 'valid-token' } });

    await fillAndSubmit();

    await screen.findByText('Welcome!');
    expect(
      screen.getByText('You have joined the campaign successfully.'),
    ).toBeInTheDocument();
  });

  it('stores csrfToken from claim-invite response in authState', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeClaimResponse()))
      .mockResolvedValueOnce(makeOkResponse(makeMeResponse()));

    authState.csrfToken = null;
    render(JoinPage, { props: { token: 'valid-token' } });

    await fillAndSubmit();

    await screen.findByText('Welcome!');
    expect(authState.csrfToken).toBe('csrf-xyz');
  });

  it('sends inviteToken, pin, mode, username and password in request body', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeClaimResponse()))
      .mockResolvedValueOnce(makeOkResponse(makeMeResponse()));

    render(JoinPage, { props: { token: 'invite-xyz' } });

    await fillAndSubmit({
      pin: '5678',
      username: 'player1',
      password: 'password123',
    });

    await screen.findByText('Welcome!');

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/auth/claim-invite');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({
      mode: 'register',
      inviteToken: 'invite-xyz',
      pin: '5678',
      username: 'player1',
      password: 'password123',
    });
  });
});

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------

describe('JoinPage error states', () => {
  it('shows "invalid or has expired" on 400', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(400, 'INVALID_TOKEN'));

    render(JoinPage, { props: { token: 'tok' } });
    await fillAndSubmit();

    await screen.findByText(/invalid or has expired/);
  });

  it('shows "Incorrect PIN" on 401', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(401, 'WRONG_PIN'));

    render(JoinPage, { props: { token: 'tok' } });
    await fillAndSubmit();

    await screen.findByText(/Incorrect PIN/);
  });

  it('shows username-taken message on 409 in register mode', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeErrorResponse(409, 'USERNAME_TAKEN'),
    );

    render(JoinPage, { props: { token: 'tok' } });
    await fillAndSubmit();

    await screen.findByText(/already taken/);
  });

  it('shows INVITE_RACE_LOST message when invite was already claimed', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeErrorResponse(409, 'INVITE_RACE_LOST'),
    );

    render(JoinPage, { props: { token: 'tok' } });
    await fillAndSubmit();

    await screen.findByText(/Someone just claimed this invite/);
  });

  it('shows USERNAME_TAKEN inline on username field (not generic error)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeErrorResponse(409, 'USERNAME_TAKEN'),
    );

    render(JoinPage, { props: { token: 'tok' } });
    await fillAndSubmit();

    // USERNAME_TAKEN renders inline below the username field, not in the main error div
    await screen.findByText('That username is already taken.');
    expect(
      screen.queryByText(/Try logging in instead/),
    ).not.toBeInTheDocument();
  });

  it('shows generic error on 500', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500));

    render(JoinPage, { props: { token: 'tok' } });
    await fillAndSubmit();

    await screen.findByText(/An error occurred/);
  });

  it('shows network error message when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Network error'));

    render(JoinPage, { props: { token: 'tok' } });
    await fillAndSubmit();

    await screen.findByText(/Could not connect/);
  });
});

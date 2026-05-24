/**
 * JoinPage component tests.
 *
 * Patterns:
 * - Mock global.fetch to control server responses (real fetch replaces the old setTimeout mock)
 * - Use vi.useFakeTimers() to prevent post-success redirect timer from firing
 * - Use screen.findBy* for assertions after async fetch resolves
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import JoinPage from './JoinPage.svelte';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: object = { success: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeErrorResponse(status: number, body: object = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('JoinPage rendering', () => {
  it('renders the invite token in a readonly field', () => {
    render(JoinPage, { token: 'my-invite-token' });

    const tokenInput = screen.getByLabelText(
      'Invite Token',
    ) as HTMLInputElement;
    expect(tokenInput.value).toBe('my-invite-token');
    expect(tokenInput).toHaveAttribute('readonly');
  });

  it('renders the PIN input and submit button', () => {
    render(JoinPage, { token: 'abc' });

    expect(screen.getByLabelText('Enter PIN')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Claim Invite' }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('JoinPage validation', () => {
  it('shows error when PIN is too short on submit', async () => {
    render(JoinPage, { token: 'abc' });

    fireEvent.input(screen.getByLabelText('Enter PIN'), {
      target: { value: '123' }, // < 4 chars
    });
    fireEvent.click(screen.getByRole('button', { name: 'Claim Invite' }));

    await screen.findByText('Please enter a valid PIN');
    // fetch should not have been called
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows error when PIN is empty on submit', async () => {
    render(JoinPage, { token: 'abc' });

    fireEvent.click(screen.getByRole('button', { name: 'Claim Invite' }));

    await screen.findByText('Please enter a valid PIN');
  });
});

// ---------------------------------------------------------------------------
// Successful claim
// ---------------------------------------------------------------------------

describe('JoinPage successful claim', () => {
  it('shows success message after successful claim', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse(),
    );

    render(JoinPage, { token: 'valid-token' });

    fireEvent.input(screen.getByLabelText('Enter PIN'), {
      target: { value: '1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Claim Invite' }));

    await screen.findByText('Welcome!');
    expect(
      screen.getByText('Your invite has been claimed successfully.'),
    ).toBeInTheDocument();
  });

  it('sends token and pin in the request body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse(),
    );

    render(JoinPage, { token: 'invite-xyz' });

    fireEvent.input(screen.getByLabelText('Enter PIN'), {
      target: { value: '5678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Claim Invite' }));

    await screen.findByText('Welcome!');

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe('/api/auth/claim-invite');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      token: 'invite-xyz',
      pin: '5678',
    });
  });
});

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------

describe('JoinPage error states', () => {
  async function renderAndFillPin(pin = '1234'): Promise<void> {
    render(JoinPage, { token: 'tok' });
    fireEvent.input(screen.getByLabelText('Enter PIN'), {
      target: { value: pin },
    });
  }

  it('shows "Invite not found or has expired" on 404', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeErrorResponse(404),
    );
    await renderAndFillPin();
    fireEvent.click(screen.getByRole('button', { name: 'Claim Invite' }));
    await screen.findByText(/Invite not found or has expired/);
  });

  it('shows "already been claimed" on 409', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeErrorResponse(409),
    );
    await renderAndFillPin();
    fireEvent.click(screen.getByRole('button', { name: 'Claim Invite' }));
    await screen.findByText(/already been claimed/);
  });

  it('shows "Incorrect PIN" on 403', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeErrorResponse(403),
    );
    await renderAndFillPin();
    fireEvent.click(screen.getByRole('button', { name: 'Claim Invite' }));
    await screen.findByText('Incorrect PIN');
  });

  it('shows generic error on unexpected status', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeErrorResponse(500),
    );
    await renderAndFillPin();
    fireEvent.click(screen.getByRole('button', { name: 'Claim Invite' }));
    await screen.findByText(/An error occurred/);
  });

  it('shows network error message when fetch throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Network error'),
    );
    await renderAndFillPin();
    fireEvent.click(screen.getByRole('button', { name: 'Claim Invite' }));
    await screen.findByText(/Failed to connect to server/);
  });
});

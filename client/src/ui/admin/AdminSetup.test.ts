/**
 * AdminSetup component tests.
 *
 * Patterns:
 * - Mock global.fetch to control server responses
 * - Spy on window.history.pushState to verify navigation
 * - Spy on adminAuth.setCsrfToken to verify CSRF token storage
 * - Use screen.findBy* (async) to wait for onMount async operations to settle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { adminAuth } from '../../state/admin.svelte';
import AdminSetup from './AdminSetup.svelte';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    // ok is false for non-2xx statuses in the real Fetch API
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let pushStateSpy: ReturnType<typeof vi.spyOn>;
let setCsrfSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  global.fetch = vi.fn();
  pushStateSpy = vi.spyOn(window.history, 'pushState');
  adminAuth.clearCsrfToken();
  setCsrfSpy = vi.spyOn(adminAuth, 'setCsrfToken');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial render
// ---------------------------------------------------------------------------

describe('AdminSetup initial render', () => {
  it('shows checking spinner while setup status is being verified', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    render(AdminSetup);

    expect(screen.getByText('Checking setup status...')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// onMount checkSetupStatus
// ---------------------------------------------------------------------------

describe('AdminSetup onMount checkSetupStatus', () => {
  it('redirects to /admin when setup is already complete', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse({ needsSetup: false }),
    );

    render(AdminSetup);

    await vi.waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/admin');
    });
  });

  it('shows setup form when setup is needed', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse({ needsSetup: true }),
    );

    render(AdminSetup);

    await screen.findByRole('heading', { name: 'Server Admin Setup' });
    expect(screen.getByLabelText('Setup PIN')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('shows error message on network failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Network error'),
    );

    render(AdminSetup);

    await screen.findByText(/Failed to connect to server/);
  });
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

describe('AdminSetup form validation', () => {
  async function renderAndWaitForForm(): Promise<HTMLElement> {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeOkResponse({ needsSetup: true }),
    );
    const { container } = render(AdminSetup);
    await screen.findByRole('heading', { name: 'Server Admin Setup' });
    return container;
  }

  it('shows error when PIN is empty on submit', async () => {
    const container = await renderAndWaitForForm();

    // fireEvent.submit bypasses native required-field validation in happy-dom
    fireEvent.submit(container.querySelector('form')!);

    await screen.findByText('Please enter the setup PIN');
  });

  it('shows error when passwords do not match', async () => {
    await renderAndWaitForForm();

    fireEvent.input(screen.getByLabelText('Setup PIN'), {
      target: { value: 'TESTPIN1' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.input(screen.getByLabelText('Confirm Password'), {
      target: { value: 'different456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }));

    await screen.findByText('Passwords do not match');
  });

  it('shows error when password is fewer than 8 characters', async () => {
    const container = await renderAndWaitForForm();

    fireEvent.input(screen.getByLabelText('Setup PIN'), {
      target: { value: 'TESTPIN1' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'short' },
    });
    fireEvent.input(screen.getByLabelText('Confirm Password'), {
      target: { value: 'short' },
    });
    // fireEvent.submit bypasses native minlength validation in happy-dom
    fireEvent.submit(container.querySelector('form')!);

    await screen.findByText('Password must be at least 8 characters');
  });
});

// ---------------------------------------------------------------------------
// Setup submission
// ---------------------------------------------------------------------------

describe('AdminSetup handleSubmit', () => {
  async function renderAndFillForm(): Promise<void> {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeOkResponse({ needsSetup: true }),
    );
    render(AdminSetup);
    await screen.findByRole('heading', { name: 'Server Admin Setup' });

    fireEvent.input(screen.getByLabelText('Setup PIN'), {
      target: { value: 'TESTPIN1' },
    });
    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'secure-password-123' },
    });
    fireEvent.input(screen.getByLabelText('Confirm Password'), {
      target: { value: 'secure-password-123' },
    });
  }

  it('shows error from server on 400 response', async () => {
    await renderAndFillForm();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeErrorResponse(400, { error: 'Invalid setup PIN' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }));

    await screen.findByText('Invalid setup PIN');
  });

  it('shows expired PIN message on 410 response', async () => {
    await renderAndFillForm();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeErrorResponse(410, {}),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }));

    await screen.findByText(/Setup PIN has expired/);
  });

  it('stores CSRF token and redirects to /admin on success', async () => {
    await renderAndFillForm();
    pushStateSpy.mockClear();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeOkResponse({
        csrfToken: 'setup-csrf-token',
        expiresAt: Date.now() + 3600_000,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }));

    await vi.waitFor(() => {
      expect(setCsrfSpy).toHaveBeenCalledWith('setup-csrf-token');
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/admin');
    });
  });

  it('shows error on network failure during setup', async () => {
    await renderAndFillForm();

    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('Network error'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }));

    await screen.findByText(/Failed to connect to server/);
  });
});

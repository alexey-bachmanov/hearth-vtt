/**
 * AdminLogin component tests.
 *
 * Patterns:
 * - Mock global.fetch in each test to control server responses
 * - Spy on window.history.pushState to verify navigation
 * - Spy on adminAuth.setCsrfToken to verify CSRF token storage
 * - Use screen.findBy* (async) to wait for onMount async operations to settle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { adminAuth } from '../../state/admin.svelte';
import AdminLogin from './AdminLogin.svelte';

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
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let pushStateSpy: ReturnType<typeof vi.spyOn>;
let setCsrfSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Reset fetch mock
  global.fetch = vi.fn();

  // Spy on navigation
  pushStateSpy = vi.spyOn(window.history, 'pushState');

  // Spy on CSRF token storage and reset state
  adminAuth.clearCsrfToken();
  setCsrfSpy = vi.spyOn(adminAuth, 'setCsrfToken');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial render
// ---------------------------------------------------------------------------

describe('AdminLogin initial render', () => {
  it('shows checking spinner while auth status is being verified', () => {
    // fetch never resolves so we stay in 'checking' state
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    render(AdminLogin);

    expect(screen.getByText('Checking authentication...')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// onMount auth check
// ---------------------------------------------------------------------------

describe('AdminLogin onMount checkAuthStatus', () => {
  it('redirects to /admin/setup when needsSetup is true', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse({ needsSetup: true }),
    );

    render(AdminLogin);

    // Wait for the async onMount to complete and navigate
    await vi.waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/admin/setup');
    });
  });

  it('redirects to /admin when already authenticated', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse({ authenticated: true }),
    );

    render(AdminLogin);

    await vi.waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/admin');
    });
  });

  it('shows login form when not authenticated', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse({ authenticated: false }),
    );

    render(AdminLogin);

    // Wait for form to appear
    await screen.findByRole('heading', { name: 'Server Admin Login' });
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('shows error message on network failure during auth check', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Network error'),
    );

    render(AdminLogin);

    await screen.findByText(/Failed to connect to server/);
  });
});

// ---------------------------------------------------------------------------
// Login form validation
// ---------------------------------------------------------------------------

describe('AdminLogin form validation', () => {
  beforeEach(() => {
    // Start with auth check returning not-authenticated so form shows
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOkResponse({ authenticated: false }),
    );
  });

  it('shows validation error when password is empty on submit', async () => {
    const { container } = render(AdminLogin);
    await screen.findByRole('heading', { name: 'Server Admin Login' });

    // fireEvent.submit bypasses native required-field validation in happy-dom
    fireEvent.submit(container.querySelector('form')!);

    await screen.findByText('Please enter your password');
  });
});

// ---------------------------------------------------------------------------
// Login submission
// ---------------------------------------------------------------------------

describe('AdminLogin handleSubmit', () => {
  async function renderAndWaitForForm(): Promise<void> {
    // First fetch call (checkAuthStatus) returns not-authenticated
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeOkResponse({ authenticated: false }),
    );
    render(AdminLogin);
    await screen.findByRole('heading', { name: 'Server Admin Login' });
  }

  it('shows invalid password error on 401 response', async () => {
    await renderAndWaitForForm();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeErrorResponse(401, { error: 'Unauthorized' }),
    );

    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await screen.findByText('Invalid password. Please try again.');
  });

  it('redirects to /admin/setup on 400 with "not set up" error', async () => {
    await renderAndWaitForForm();
    pushStateSpy.mockClear();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeErrorResponse(400, { error: 'Server admin not set up' }),
    );

    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'any-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await vi.waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/admin/setup');
    });
  });

  it('stores CSRF token and redirects to /admin on success', async () => {
    await renderAndWaitForForm();
    pushStateSpy.mockClear();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeOkResponse({
        csrfToken: 'my-csrf-token',
        expiresAt: Date.now() + 3600_000,
      }),
    );

    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await vi.waitFor(() => {
      expect(setCsrfSpy).toHaveBeenCalledWith('my-csrf-token');
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/admin');
    });
  });

  it('shows error on network failure during login', async () => {
    await renderAndWaitForForm();

    // First call was checkAuthStatus; second is login
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('Network error'),
    );

    fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'any-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await screen.findByText(/Failed to connect to server/);
  });
});

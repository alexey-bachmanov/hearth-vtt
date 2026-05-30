/**
 * PlayLayout accessibility tests.
 *
 * Verifies that the play UI has the correct landmark regions and a functional
 * skip-link. Landmarks are added via display:contents wrappers so they are
 * present in the accessibility tree without disturbing the flex layout.
 *
 * The render module is mocked so MainCanvas never attempts WebGL init in
 * happy-dom.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { authState } from '../../state/auth.svelte.js';

// Must be declared before the component imports so Vitest can hoist it.
vi.mock('../../render', () => ({
  createRenderer: vi.fn().mockResolvedValue({
    init: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    setScene: vi.fn(),
    updateTokens: vi.fn(),
    setViewport: vi.fn(),
    setSelection: vi.fn(),
    setHover: vi.fn(),
    setTokenDragPreview: vi.fn(),
    clearTokenDragPreview: vi.fn(),
    hitTestToken: vi.fn().mockReturnValue(null),
  }),
}));

import PlayLayout from './PlayLayout.svelte';

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

describe('PlayLayout landmarks and skip link', () => {
  it('has a skip-link to the main content', () => {
    render(PlayLayout);
    const link = screen.getByRole('link', { name: /skip to canvas/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('has a navigation landmark labeled "Tools"', () => {
    render(PlayLayout);
    expect(
      screen.getByRole('navigation', { name: 'Tools' }),
    ).toBeInTheDocument();
  });

  it('has a main landmark with id "main-content"', () => {
    render(PlayLayout);
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('id', 'main-content');
  });

  it('has a complementary landmark labeled "Chat"', () => {
    render(PlayLayout);
    expect(
      screen.getByRole('complementary', { name: 'Chat' }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Forced password-change modal
// ---------------------------------------------------------------------------

describe('PlayLayout forced-password-change modal', () => {
  it('does not render the modal when mustChangePassword is false', () => {
    authState.me = {
      accountId: 'a',
      username: 'u',
      csrfToken: 'c',
      seats: [],
      mustChangePassword: false,
    };
    render(PlayLayout);

    expect(
      screen.queryByRole('dialog', { name: /Change your password/i }),
    ).not.toBeInTheDocument();
  });

  it('renders a blocking modal when mustChangePassword is true', () => {
    authState.me = {
      accountId: 'a',
      username: 'u',
      csrfToken: 'c',
      seats: [],
      mustChangePassword: true,
    };
    render(PlayLayout);

    expect(
      screen.getByRole('dialog', { name: /Change your password/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('shows validation error when passwords do not match', async () => {
    authState.me = {
      accountId: 'a',
      username: 'u',
      csrfToken: 'c',
      seats: [],
      mustChangePassword: true,
    };
    render(PlayLayout);

    fireEvent.input(screen.getByLabelText('Current password'), {
      target: { value: 'oldpassword' },
    });
    fireEvent.input(screen.getByLabelText('New password'), {
      target: { value: 'newpassword1' },
    });
    fireEvent.input(screen.getByLabelText('Confirm new password'), {
      target: { value: 'newpassword2' },
    });
    fireEvent.submit(
      screen
        .getByRole('dialog', { name: /Change your password/i })
        .querySelector('form')!,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Passwords do not match.',
      );
    });
  });

  it('calls POST /api/auth/change-password on submit with matching passwords', async () => {
    authState.me = {
      accountId: 'a',
      username: 'u',
      csrfToken: 'csrf-tok',
      seats: [],
      mustChangePassword: true,
    };
    authState.csrfToken = 'csrf-tok';
    const fetchMock = vi.mocked(fetch);
    // First call: change-password; second: GET /api/auth/me (loadMe)
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accountId: 'a', username: 'u', csrfToken: 'c', seats: [], mustChangePassword: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    render(PlayLayout);

    fireEvent.input(screen.getByLabelText('Current password'), {
      target: { value: 'oldpassword' },
    });
    fireEvent.input(screen.getByLabelText('New password'), {
      target: { value: 'newpassword1' },
    });
    fireEvent.input(screen.getByLabelText('Confirm new password'), {
      target: { value: 'newpassword1' },
    });
    fireEvent.submit(
      screen
        .getByRole('dialog', { name: /Change your password/i })
        .querySelector('form')!,
    );

    await waitFor(() => {
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/auth/change-password');
      expect(JSON.parse(opts.body as string)).toMatchObject({
        currentPassword: 'oldpassword',
        newPassword: 'newpassword1',
      });
    });
  });
});

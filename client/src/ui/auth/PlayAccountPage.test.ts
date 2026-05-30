/**
 * PlayAccountPage component tests.
 *
 * - Renders username from authState
 * - Log Out button calls authState.logout()
 * - Log Out Everywhere button calls POST /api/auth/logout-all then navigates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { authState } from '../../state/auth.svelte.js';
import PlayAccountPage from './PlayAccountPage.svelte';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let pushStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  authState.me = {
    accountId: 'acc-1',
    username: 'testplayer',
    csrfToken: 'csrf-1',
    seats: [],
  };
  authState.csrfToken = 'csrf-1';
  vi.stubGlobal('fetch', vi.fn());
  pushStateSpy = vi
    .spyOn(window.history, 'pushState')
    .mockImplementation(() => {});
  vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  authState.me = null;
  authState.csrfToken = null;
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('PlayAccountPage rendering', () => {
  it('displays the current username', () => {
    render(PlayAccountPage);
    expect(screen.getByText('testplayer')).toBeInTheDocument();
  });

  it('renders a Log Out button', () => {
    render(PlayAccountPage);
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeInTheDocument();
  });

  it('renders a Log Out Everywhere button', () => {
    render(PlayAccountPage);
    expect(
      screen.getByRole('button', { name: 'Log Out Everywhere' }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Log Out Everywhere
// ---------------------------------------------------------------------------

describe('PlayAccountPage — Log Out Everywhere', () => {
  it('calls POST /api/auth/logout-all', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    render(PlayAccountPage);
    fireEvent.click(screen.getByRole('button', { name: 'Log Out Everywhere' }));

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      const logoutAllCall = calls.find(([url]) =>
        (url as string).includes('logout-all'),
      );
      expect(logoutAllCall).toBeDefined();
      expect(logoutAllCall![1]).toMatchObject({ method: 'POST' });
    });
  });

  it('navigates to /play/login after logout-all', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    render(PlayAccountPage);
    fireEvent.click(screen.getByRole('button', { name: 'Log Out Everywhere' }));

    await waitFor(() => {
      expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/play/login');
    });
  });
});

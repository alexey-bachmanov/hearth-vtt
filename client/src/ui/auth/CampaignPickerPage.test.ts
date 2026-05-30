/**
 * CampaignPickerPage component tests.
 *
 * Tests the /play campaign-list UI for:
 * - Empty state when player has no seats
 * - Populated state listing campaign entries
 * - Navigation when a campaign is clicked
 * - Account link navigation
 * - Stale-seat error toast: ?error=campaign-access-revoked on mount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { authState } from '../../state/auth.svelte.js';
import { notificationState } from '../../state/notifications.svelte.js';
import CampaignPickerPage from './CampaignPickerPage.svelte';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMeWithSeats() {
  return {
    accountId: 'acc-1',
    username: 'testplayer',
    seats: [
      {
        campaignId: 'camp-1',
        campaignName: 'Dragon Campaign',
        seatId: 'seat-1',
        role: 'player' as const,
      },
      {
        campaignId: 'camp-2',
        campaignName: 'Space Opera',
        seatId: 'seat-2',
        role: 'gm' as const,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let pushStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  authState.me = null;
  // @ts-expect-error reset loading state
  authState.loading = false;
  pushStateSpy = vi
    .spyOn(window.history, 'pushState')
    .mockImplementation(() => {});
  vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  authState.me = null;
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('CampaignPickerPage — empty state', () => {
  it('shows empty state message when seats array is empty', () => {
    authState.me = { accountId: 'acc-1', username: 'player', seats: [] };
    render(CampaignPickerPage);
    expect(
      screen.getByText('You are not signed up for any campaigns yet.'),
    ).toBeInTheDocument();
  });

  it('shows invite hint in empty state', () => {
    authState.me = { accountId: 'acc-1', username: 'player', seats: [] };
    render(CampaignPickerPage);
    expect(screen.getByText(/Ask your Game Master/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Populated state
// ---------------------------------------------------------------------------

describe('CampaignPickerPage — with campaigns', () => {
  it('renders all campaign names', () => {
    authState.me = makeMeWithSeats();
    render(CampaignPickerPage);

    expect(screen.getByText('Dragon Campaign')).toBeInTheDocument();
    expect(screen.getByText('Space Opera')).toBeInTheDocument();
  });

  it('renders seat roles', () => {
    authState.me = makeMeWithSeats();
    render(CampaignPickerPage);

    expect(screen.getByText('player')).toBeInTheDocument();
    expect(screen.getByText('gm')).toBeInTheDocument();
  });

  it('navigates to /play/:campaignId when campaign button is clicked', () => {
    authState.me = makeMeWithSeats();
    render(CampaignPickerPage);

    fireEvent.click(screen.getByText('Dragon Campaign'));

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/play/camp-1');
  });
});

// ---------------------------------------------------------------------------
// Account link
// ---------------------------------------------------------------------------

describe('CampaignPickerPage — account link', () => {
  it('shows username as account link', () => {
    authState.me = makeMeWithSeats();
    render(CampaignPickerPage);

    expect(screen.getByText('testplayer')).toBeInTheDocument();
  });

  it('navigates to /play/account when account link is clicked', () => {
    authState.me = makeMeWithSeats();
    render(CampaignPickerPage);

    fireEvent.click(screen.getByText('testplayer'));

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/play/account');
  });
});

// ---------------------------------------------------------------------------
// Stale-seat error toast
// ---------------------------------------------------------------------------

describe('CampaignPickerPage — stale-seat toast', () => {
  let warningSpy: ReturnType<typeof vi.spyOn>;
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warningSpy = vi.spyOn(notificationState, 'warning').mockImplementation(
      () => ({ id: '1', type: 'persistent', kind: 'warning', message: '' }),
    );
    replaceStateSpy = vi
      .spyOn(window.history, 'replaceState')
      .mockImplementation(() => {});
  });

  it('shows a warning toast when ?error=campaign-access-revoked is in the URL', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?error=campaign-access-revoked' },
      writable: true,
      configurable: true,
    });

    authState.me = { accountId: 'acc-1', username: 'player', seats: [] };
    render(CampaignPickerPage);

    await waitFor(() => {
      expect(warningSpy).toHaveBeenCalledWith(
        expect.stringContaining('revoked'),
        'ephemeral',
      );
    });
  });

  it('strips the error param from the URL', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        pathname: '/play',
        search: '?error=campaign-access-revoked',
      },
      writable: true,
      configurable: true,
    });

    authState.me = { accountId: 'acc-1', username: 'player', seats: [] };
    render(CampaignPickerPage);

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/play');
    });
  });

  it('does not show a toast when no error param is present', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
      configurable: true,
    });

    authState.me = { accountId: 'acc-1', username: 'player', seats: [] };
    render(CampaignPickerPage);

    await waitFor(() => {
      expect(warningSpy).not.toHaveBeenCalled();
    });
  });
});

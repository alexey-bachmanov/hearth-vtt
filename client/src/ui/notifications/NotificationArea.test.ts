/**
 * NotificationArea component tests.
 *
 * Patterns:
 * - Import the notificationState singleton directly and mutate it to drive the component
 * - Call notificationState.reset() in beforeEach to isolate tests
 * - Push 'persistent' notifications to avoid auto-dismiss timers interfering
 * - Use vi.useFakeTimers() only for the dismiss animation (250 ms)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { notificationState } from '../../state/notifications.svelte';
import NotificationArea from './NotificationArea.svelte';

beforeEach(() => {
  notificationState.reset();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('NotificationArea rendering', () => {
  it('renders nothing when there are no notifications', () => {
    render(NotificationArea);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders one card for a single notification', () => {
    notificationState.push('client', 'persistent', 'info', 'Hello world');

    render(NotificationArea);

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders a card for every notification in state', () => {
    notificationState.push('client', 'persistent', 'info', 'First message');
    notificationState.push('client', 'persistent', 'warning', 'Second message');
    notificationState.push('client', 'persistent', 'error', 'Third message');

    render(NotificationArea);

    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
    expect(screen.getByText('Third message')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dismiss
// ---------------------------------------------------------------------------

describe('NotificationArea dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes a notification from state after dismiss animation completes', () => {
    const id = notificationState.push(
      'client',
      'persistent',
      'info',
      'Dismiss me',
    );

    render(NotificationArea);

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss notification' }),
    );

    // Before animation completes the notification is still in state
    expect(notificationState.notifications.some((n) => n.id === id)).toBe(true);

    vi.advanceTimersByTime(250);

    // After animation completes, dismiss callback fires and removes from state
    expect(notificationState.notifications.some((n) => n.id === id)).toBe(
      false,
    );
  });

  it('removes only the dismissed card when multiple notifications exist', () => {
    notificationState.push('client', 'persistent', 'info', 'Keep me');
    const toRemoveId = notificationState.push(
      'client',
      'persistent',
      'error',
      'Remove me',
    );

    render(NotificationArea);

    // The two dismiss buttons correspond to the two notifications
    const dismissButtons = screen.getAllByRole('button', {
      name: 'Dismiss notification',
    });
    expect(dismissButtons).toHaveLength(2);

    // Click the second dismiss button (belongs to 'Remove me')
    fireEvent.click(dismissButtons[1]);
    vi.advanceTimersByTime(250);

    expect(
      notificationState.notifications.some((n) => n.id === toRemoveId),
    ).toBe(false);
    expect(notificationState.notifications).toHaveLength(1);
    expect(notificationState.notifications[0].message).toBe('Keep me');
  });
});

/**
 * NotificationCard component tests — reference pattern for agent-written tests.
 *
 * Patterns demonstrated here:
 * - Rendering Svelte 5 rune-based components with @testing-library/svelte
 * - Querying by ARIA role, label, and text
 * - Testing DOM attributes (role, aria-live)
 * - Controlling setTimeout with vi.useFakeTimers / vi.advanceTimersByTime
 * - Using fireEvent for simple interactions (no need for userEvent here)
 * - Inline fixture construction (no shared state store needed)
 *
 * Anti-patterns to avoid:
 * - Do NOT import or call notificationState — props are passed directly to the component
 * - Do NOT test CSS classes (implementation detail); test ARIA and content instead
 * - Do NOT use real timers for the 250 ms dismiss animation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type {
  Notification,
  NotificationAction,
} from '../../state/notifications.svelte';
import NotificationCard from './NotificationCard.svelte';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'test-notif-1',
    type: 'ephemeral',
    kind: 'info',
    message: 'Something happened',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeAction(label: string, onClick = vi.fn()): NotificationAction {
  return { label, onClick };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationCard', () => {
  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe('rendering', () => {
    it('renders the notification message', () => {
      render(NotificationCard, {
        notification: makeNotification({ message: 'Roll saved successfully' }),
        onDismiss: vi.fn(),
      });

      expect(screen.getByText('Roll saved successfully')).toBeInTheDocument();
    });

    it('has role="alert" for screen reader announcement', () => {
      render(NotificationCard, {
        notification: makeNotification(),
        onDismiss: vi.fn(),
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('has aria-live="polite" for ephemeral notifications', () => {
      render(NotificationCard, {
        notification: makeNotification({ type: 'ephemeral' }),
        onDismiss: vi.fn(),
      });

      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
    });

    it('has aria-live="assertive" for persistent notifications', () => {
      render(NotificationCard, {
        notification: makeNotification({ type: 'persistent' }),
        onDismiss: vi.fn(),
      });

      expect(screen.getByRole('alert')).toHaveAttribute(
        'aria-live',
        'assertive',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Default dismiss button (no actions)
  // -------------------------------------------------------------------------

  describe('dismiss button (no actions provided)', () => {
    it('shows a dismiss button when no actions are provided', () => {
      render(NotificationCard, {
        notification: makeNotification({ actions: undefined }),
        onDismiss: vi.fn(),
      });

      expect(
        screen.getByRole('button', { name: 'Dismiss notification' }),
      ).toBeInTheDocument();
    });

    it('does not show action buttons when no actions are provided', () => {
      render(NotificationCard, {
        notification: makeNotification({ actions: undefined }),
        onDismiss: vi.fn(),
      });

      // There is exactly one button: the dismiss button
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Dismiss timing — uses fake timers to control the 250 ms animation delay
  // -------------------------------------------------------------------------

  describe('dismiss timing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does NOT call onDismiss immediately when dismiss button is clicked', () => {
      const onDismiss = vi.fn();
      render(NotificationCard, {
        notification: makeNotification({ id: 'notif-abc' }),
        onDismiss,
      });

      fireEvent.click(
        screen.getByRole('button', { name: 'Dismiss notification' }),
      );

      // Animation is in progress — callback not yet called
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('calls onDismiss with the notification id after the 250 ms animation completes', () => {
      const onDismiss = vi.fn();
      render(NotificationCard, {
        notification: makeNotification({ id: 'notif-abc' }),
        onDismiss,
      });

      fireEvent.click(
        screen.getByRole('button', { name: 'Dismiss notification' }),
      );
      vi.advanceTimersByTime(250);

      expect(onDismiss).toHaveBeenCalledOnce();
      expect(onDismiss).toHaveBeenCalledWith('notif-abc');
    });
  });

  // -------------------------------------------------------------------------
  // Action buttons
  // -------------------------------------------------------------------------

  describe('action buttons', () => {
    it('renders action buttons instead of the dismiss button when actions are provided', () => {
      const notification = makeNotification({
        actions: [makeAction('Confirm'), makeAction('Cancel')],
      });

      render(NotificationCard, { notification, onDismiss: vi.fn() });

      expect(
        screen.getByRole('button', { name: 'Confirm' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Cancel' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Dismiss notification' }),
      ).not.toBeInTheDocument();
    });

    it('calls the action onClick callback when an action button is clicked', () => {
      vi.useFakeTimers();
      const onClick = vi.fn();
      const notification = makeNotification({
        actions: [makeAction('Confirm', onClick)],
      });

      render(NotificationCard, { notification, onDismiss: vi.fn() });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      expect(onClick).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it('also triggers dismiss after action button is clicked', () => {
      vi.useFakeTimers();
      const onDismiss = vi.fn();
      const notification = makeNotification({
        id: 'notif-xyz',
        actions: [makeAction('OK')],
      });

      render(NotificationCard, { notification, onDismiss });
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
      vi.advanceTimersByTime(250);

      expect(onDismiss).toHaveBeenCalledOnce();
      expect(onDismiss).toHaveBeenCalledWith('notif-xyz');
      vi.useRealTimers();
    });
  });
});

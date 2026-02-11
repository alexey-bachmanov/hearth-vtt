/**
 * Notification state management using Svelte 5 runes.
 *
 * This module holds the reactive state for the notification toast system.
 * Manages ephemeral and persistent notifications displayed in the bottom-left corner.
 */

/**
 * Notification severity levels.
 *
 * Semantic kinds (info, success, warning, error) for standard notifications.
 * Color kinds (yellow, purple, pink, blue, green, red, orange) for custom prompt-style notifications.
 */
export type NotificationKind =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'yellow'
  | 'purple'
  | 'pink'
  | 'blue'
  | 'green'
  | 'red'
  | 'orange';

/**
 * Notification types.
 *
 * - ephemeral: Auto-dismiss after timeout (e.g., "Roll saved")
 * - persistent: Shows until explicitly dismissed or action taken (e.g., "New version available", complex prompts)
 */
export type NotificationType = 'ephemeral' | 'persistent';

/**
 * Notification data structure.
 */
export interface Notification {
  id: string;
  type: NotificationType;
  kind: NotificationKind;
  message: string;
  timestamp: number;
  actions?: NotificationAction[];
}

/**
 * Notification action (button in notification card).
 */
export interface NotificationAction {
  label: string;
  onClick: () => void;
}

/**
 * NotificationState manages the notification toast queue.
 *
 * Supports ephemeral (auto-dismiss) and persistent (action-required) notifications.
 * Displayed in bottom-left corner as a vertical stack.
 */
class NotificationState {
  // Active notifications
  notifications = $state<Notification[]>([]);

  // Auto-dismiss timeout (ms)
  ephemeralTimeout = $state<number>(5000);

  // ============================================================================
  // Push Methods
  // ============================================================================

  /**
   * Push a new notification to the stack.
   */
  push(
    type: NotificationType,
    kind: NotificationKind,
    message: string,
    actions?: NotificationAction[],
  ): string {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const notification: Notification = {
      id,
      type,
      kind,
      message,
      timestamp: Date.now(),
      actions,
    };

    this.notifications.push(notification);

    // Auto-dismiss ephemeral notifications
    if (type === 'ephemeral') {
      setTimeout(() => this.dismiss(id), this.ephemeralTimeout);
    }

    return id;
  }

  /**
   * Push an info notification.
   */
  info(message: string, type: NotificationType = 'ephemeral') {
    return this.push(type, 'info', message);
  }

  /**
   * Push a success notification.
   */
  success(message: string, type: NotificationType = 'ephemeral') {
    return this.push(type, 'success', message);
  }

  /**
   * Push a warning notification.
   */
  warning(message: string, type: NotificationType = 'persistent') {
    return this.push(type, 'warning', message);
  }

  /**
   * Push an error notification.
   */
  error(message: string, type: NotificationType = 'persistent') {
    return this.push(type, 'error', message);
  }

  /**
   * Push a persistent notification with actions (prompt-style).
   */
  prompt(
    kind: NotificationKind,
    message: string,
    actions: NotificationAction[],
  ) {
    return this.push('persistent', kind, message, actions);
  }

  // ============================================================================
  // Dismiss Methods
  // ============================================================================

  /**
   * Dismiss a notification by ID.
   */
  dismiss(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id);
  }

  /**
   * Dismiss all ephemeral notifications.
   */
  dismissAllEphemeral() {
    this.notifications = this.notifications.filter(
      (n) => n.type !== 'ephemeral',
    );
  }

  /**
   * Dismiss all notifications.
   */
  dismissAll() {
    this.notifications = [];
  }

  /**
   * Clear all notifications (alias for dismissAll).
   */
  clear() {
    this.notifications = [];
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Set ephemeral notification timeout (ms).
   */
  setEphemeralTimeout(timeout: number) {
    this.ephemeralTimeout = timeout;
  }

  // ============================================================================
  // Reset
  // ============================================================================

  reset() {
    this.notifications = [];
    this.ephemeralTimeout = 5000;
  }

  // ============================================================================
  // Mock Data (for development)
  // ============================================================================

  /**
   * Load DnD-flavored mock notifications for UI testing.
   */
  loadMockNotifications() {
    // Clear existing notifications
    this.clear();

    // Ephemeral success - dice roll result
    this.success('Rolled 18 for Perception check!');

    // Ephemeral info - character action
    this.info('Thalia cast Fireball at 3rd level');

    // Persistent warning - resource low
    this.warning('Kael has only 2 spell slots remaining');

    // Persistent error - failed action
    this.error('Cannot cast spell: Not enough movement remaining');

    // Persistent prompt with actions - saving throw
    this.prompt('purple', 'Dex saving throw vs DC 15 or take 4d6 fire damage', [
      {
        label: 'Roll Save',
        onClick: () => console.log('Rolling Dex save...'),
      },
      {
        label: 'Cancel',
        onClick: () => console.log('Canceling action...'),
      },
    ]);

    // Persistent prompt with actions - target selection
    this.prompt('blue', 'Select target for Eldritch Blast', [
      {
        label: 'Select Target',
        onClick: () => console.log('Selecting target...'),
      },
      {
        label: 'Cancel Attack',
        onClick: () => console.log('Canceling attack...'),
      },
    ]);
  }
}

/**
 * Singleton notification state instance.
 */
export const notificationState = new NotificationState();

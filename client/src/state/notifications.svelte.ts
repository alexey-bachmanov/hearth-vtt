/**
 * Notification state management using Svelte 5 runes.
 *
 * This module holds the reactive state for the notification toast system.
 * Manages ephemeral, blocking, and persistent notifications displayed in the bottom-left corner.
 */

/**
 * Notification severity levels.
 */
export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

/**
 * Notification types.
 *
 * - ephemeral: Auto-dismiss after timeout (e.g., "Roll saved")
 * - blocking: Requires user action (e.g., "Connection lost - reconnect?")
 * - persistent: Shows until explicitly dismissed (e.g., "New version available")
 */
export type NotificationType = 'ephemeral' | 'blocking' | 'persistent';

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
 * Supports ephemeral (auto-dismiss), blocking (requires action), and persistent (manual dismiss) notifications.
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
   * Push a blocking notification with actions.
   */
  blocking(
    kind: NotificationKind,
    message: string,
    actions: NotificationAction[],
  ) {
    return this.push('blocking', kind, message, actions);
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
   * Dismiss all notifications (except blocking).
   */
  dismissAll() {
    this.notifications = this.notifications.filter(
      (n) => n.type === 'blocking',
    );
  }

  /**
   * Clear all notifications (including blocking).
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
}

/**
 * Singleton notification state instance.
 */
export const notificationState = new NotificationState();

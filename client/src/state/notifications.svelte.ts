/**
 * Notification state management using Svelte 5 runes.
 *
 * Implements the notification 2×2 model:
 *   origin: 'server' | 'client'  ×  lifetime: 'persistent' | 'ephemeral'
 *
 * |             | Persistent               | Ephemeral                          |
 * |-------------|--------------------------|------------------------------------|
 * | **Server**  | Prompts (promptId refs)  | Feed entries ("X attacked Y")      |
 * | **Client**  | Offline indicators, etc. | Toasts ("Roll saved", "Connected") |
 *
 * Prompts are stored as lightweight references (`promptId`) rather than copies
 * of the full Prompt object. The actual prompt data lives in CampaignState,
 * populated from the server's SeatView.activePrompts.
 *
 * @see shared/src/notification.ts
 */

import type {
  NotificationOrigin,
  NotificationLifetime,
} from '@hearth-vtt/shared';

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
 * Notification data structure.
 *
 * Each notification occupies one cell of the 2×2 model:
 *
 * - `origin` — where the notification came from (server state vs client-local)
 * - `lifetime` — how long it sticks around (auto-dismiss vs action-required)
 * - `promptId` — if set, this notification is a reference to a server Prompt
 *   (origin=server, lifetime=persistent). The UI reads the full Prompt from
 *   CampaignState.activePrompts by this ID.
 */
export interface Notification {
  id: string;
  origin: NotificationOrigin;
  lifetime: NotificationLifetime;
  kind: NotificationKind;
  message: string;
  timestamp: number;
  actions?: NotificationAction[];
  /** If set, this notification is a reference to a server Prompt by ID. */
  promptId?: string;
}

/**
 * Notification action (button in notification card).
 */
export interface NotificationAction {
  label: string;
  onClick: () => void;
}

/**
 * NotificationState manages the notification toast queue using the 2×2 model.
 *
 * - **Toasts** (client, ephemeral): auto-dismiss after a timeout.
 * - **Feed entries** (server, ephemeral): auto-dismiss, from server events.
 * - **Persistent client messages** (client, persistent): manual dismiss only.
 * - **Prompt references** (server, persistent): tracked by promptId; actual
 *   Prompt data lives in CampaignState.
 *
 * Displayed in bottom-left corner as a vertical stack.
 */
class NotificationState {
  // Active notifications
  notifications = $state<Notification[]>([]);

  // Auto-dismiss timeout (ms) for ephemeral notifications
  ephemeralTimeout = $state<number>(5000);

  // ============================================================================
  // ID Generation
  // ============================================================================

  #nextId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // ============================================================================
  // Push Methods — 2×2 model
  // ============================================================================

  /**
   * Low-level push. Prefer the dedicated methods below.
   */
  push(
    origin: NotificationOrigin,
    lifetime: NotificationLifetime,
    kind: NotificationKind,
    message: string,
    actions?: NotificationAction[],
    promptId?: string,
  ): string {
    const id = this.#nextId();
    const notification: Notification = {
      id,
      origin,
      lifetime,
      kind,
      message,
      timestamp: Date.now(),
      actions,
      promptId,
    };

    this.notifications.push(notification);

    // Auto-dismiss ephemeral notifications
    if (lifetime === 'ephemeral') {
      setTimeout(() => this.dismiss(id), this.ephemeralTimeout);
    }

    return id;
  }

  /**
   * Push a **toast** — (client, ephemeral).
   *
   * Client-local transient messages that auto-dismiss.
   * Examples: "Roll saved", "Reconnected", "Setting applied".
   */
  toast(kind: NotificationKind, message: string): string {
    return this.push('client', 'ephemeral', kind, message);
  }

  /**
   * Push a **feed entry** — (server, ephemeral).
   *
   * Server-driven event notifications that auto-dismiss.
   * Examples: "Thalia attacked the goblin", "Goblin rolled 14".
   * These are also recorded in the campaign event log for later review.
   */
  feedEntry(kind: NotificationKind, message: string): string {
    return this.push('server', 'ephemeral', kind, message);
  }

  /**
   * Push a **persistent client message** — (client, persistent).
   *
   * Client-local messages that require user action or acknowledgment.
   * Examples: "Connection lost — retrying", "App updated — reload".
   */
  persistent(
    kind: NotificationKind,
    message: string,
    actions?: NotificationAction[],
  ): string {
    return this.push('client', 'persistent', kind, message, actions);
  }

  /**
   * Track a **server prompt** — (server, persistent).
   *
   * Adds a lightweight notification referencing a server-owned Prompt.
   * The UI should read the full Prompt data from CampaignState.activePrompts.
   *
   * @param promptId — The Prompt's canonical ID from the server.
   * @param title — The prompt's title (copied as message for immediate display).
   */
  trackPrompt(promptId: string, title: string): string {
    // Remove any existing notification for the same promptId (refresh).
    this.notifications = this.notifications.filter(
      (n) => n.promptId !== promptId,
    );
    return this.push(
      'server',
      'persistent',
      'info',
      title,
      undefined,
      promptId,
    );
  }

  /**
   * Stop tracking a server prompt — (server, persistent).
   *
   * Called when a prompt is resolved, cancelled, or expires on the server.
   */
  untrackPrompt(promptId: string): void {
    this.notifications = this.notifications.filter(
      (n) => n.promptId !== promptId,
    );
  }

  // ============================================================================
  // Convenience Shorthands (origin = 'client')
  // ============================================================================

  /**
   * Push a client info notification. Default lifetime: ephemeral.
   */
  info(message: string, lifetime: NotificationLifetime = 'ephemeral'): string {
    return this.push('client', lifetime, 'info', message);
  }

  /**
   * Push a client success notification. Default lifetime: ephemeral.
   */
  success(
    message: string,
    lifetime: NotificationLifetime = 'ephemeral',
  ): string {
    return this.push('client', lifetime, 'success', message);
  }

  /**
   * Push a client warning notification. Default lifetime: persistent.
   */
  warning(
    message: string,
    lifetime: NotificationLifetime = 'persistent',
  ): string {
    return this.push('client', lifetime, 'warning', message);
  }

  /**
   * Push a client error notification. Default lifetime: persistent.
   */
  error(
    message: string,
    lifetime: NotificationLifetime = 'persistent',
  ): string {
    return this.push('client', lifetime, 'error', message);
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
      (n) => n.lifetime !== 'ephemeral',
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
   * Load mock notifications for UI testing.
   */
  loadMockNotifications() {
    this.clear();

    // (client, ephemeral) — toasts
    this.toast('success', 'Rolled 18 for Perception check!');
    this.toast('info', 'Thalia cast Fireball at 3rd level');

    // (client, persistent) — app-level messages
    this.persistent('warning', 'Kael has only 2 spell slots remaining');
    this.persistent(
      'error',
      'Cannot cast spell: Not enough movement remaining',
    );

    // (server, persistent) — prompt references (mock prompt IDs)
    this.trackPrompt(
      'prompt-mock-save-01',
      'Dex saving throw vs DC 15 or take 4d6 fire damage',
    );
    this.trackPrompt(
      'prompt-mock-target-02',
      'Select target for Eldritch Blast',
    );
  }
}

/**
 * Singleton notification state instance.
 */
export const notificationState = new NotificationState();

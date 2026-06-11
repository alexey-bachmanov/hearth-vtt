<script lang="ts">
/**
 * NotificationCard - Individual notification toast.
 *
 * Displays a notification with kind-specific styling and actions.
 * Layout: text | divider | action | divider | action
 *
 * Props:
 * - notification: Notification object with id, origin, lifetime, kind, message,
 *   actions, and optionally promptId (for server prompt references)
 * - onDismiss: Callback to dismiss the notification
 *
 * Behavior:
 * - If no actions provided, shows default dismiss button with X icon
 * - If actions provided, shows action buttons instead of default dismiss
 * - Ephemeral notifications auto-dismiss; persistent stay until action taken
 *
 * origin display:
 * - Server-originated notifications show a small "SV" badge (server).
 * - Client-originated notifications show nothing extra.
 */

import { X } from 'lucide-svelte';
import type { Notification } from '../../state/notifications.svelte';
import { Icon } from '../shared';

interface Props {
  notification: Notification;
  onDismiss: (id: string) => void;
}

let { notification, onDismiss }: Props = $props();

// Track dismissing animation state
let dismissing = $state(false);

// Determine if we should show actions or default dismiss button
const hasActions = $derived(
  notification.actions !== undefined && notification.actions.length > 0,
);

// Show origin badge for server-originated notifications
const showOriginBadge = $derived(notification.origin === 'server');

/**
 * Handle dismiss with animation.
 */
function handleDismiss() {
  dismissing = true;
  // Wait for animation to complete before calling onDismiss
  setTimeout(() => {
    onDismiss(notification.id);
  }, 250); // Match --transition-normal
}

/**
 * Handle action button click.
 */
function handleAction(action: () => void) {
  action();
  handleDismiss();
}
</script>

<div
  class="notification-card notification-card--{notification.kind}"
  class:notification-card--dismissing={dismissing}
  class:notification-card--server={showOriginBadge}
  role="alert"
  aria-live={notification.lifetime === 'ephemeral' ? 'polite' : 'assertive'}
>
  <div class="notification-card__message">
    {#if showOriginBadge}
      <span class="notification-card__origin-badge" aria-label="Server notification">SV</span>
    {/if}
    {notification.message}
  </div>

  {#if hasActions}
    {#each notification.actions as action (action.label)}
      <div class="notification-card__divider"></div>
      <button
        class="notification-card__action"
        onclick={() => handleAction(action.onClick)}
        aria-label={action.label}
      >
        {action.label}
      </button>
    {/each}
  {:else}
    <div class="notification-card__divider"></div>
    <button
      class="notification-card__action notification-card__action--dismiss"
      onclick={handleDismiss}
      aria-label="Dismiss notification"
    >
      <Icon icon={X} size={16} label="Dismiss" />
    </button>
  {/if}
</div>

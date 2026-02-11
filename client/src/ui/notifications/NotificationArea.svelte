<script lang="ts">
/**
 * NotificationArea - Container for notification toasts.
 *
 * Renders notifications in a horizontal row starting from bottom-left,
 * stacking to the right and wrapping upward when running out of space.
 *
 * Reads from notificationState and displays NotificationCard components.
 */

import { notificationState } from '../../state';
import NotificationCard from './NotificationCard.svelte';

/**
 * Handle notification dismissal.
 */
function handleDismiss(id: string) {
  notificationState.dismiss(id);
}
</script>

<div class="notification-area">
  {#each notificationState.notifications as notification (notification.id)}
    <NotificationCard {notification} onDismiss={handleDismiss} />
  {/each}
</div>

<style>
  /* All styling is in components.css for consistency */
</style>


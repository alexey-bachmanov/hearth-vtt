<script lang="ts">
/**
 * NotificationToast - Displays ephemeral notifications.
 * 
 * Auto-dismissing toast messages for non-blocking information.
 */
</script>

<div class="notification-toast">
  <div class="toast-icon">ℹ️</div>
  <div class="toast-content">
    <strong>NotificationToast</strong>
    <span>Ephemeral notifications (auto-dismiss)</span>
  </div>
  <button class="toast-close">✕</button>
</div>

<style>
  .notification-toast {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    background-color: var(--color-bg-elevated);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    animation: slideIn var(--transition-normal);
  }

  @keyframes slideIn {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .toast-icon {
    font-size: var(--font-size-xl);
  }

  .toast-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .toast-content strong {
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .toast-content span {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  .toast-close {
    padding: var(--space-xs);
    background: transparent;
    border: none;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-lg);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .toast-close:hover {
    color: var(--color-text-primary);
  }
</style>

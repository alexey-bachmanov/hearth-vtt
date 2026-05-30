<script lang="ts">
/**
 * PlayLayout - Main game interface layout.
 *
 * Composed of three layers:
 * 1. Base layer: LeftToolbar + MainCanvas (visual background)
 * 2. Overlay layer: ToolDrawer + CanvasOverlayColumn + RightSidebar (interactive UI)
 * 3. Floating layer: Draggable windows
 *
 * The base and overlay layers use flexbox for natural reflow when drawers/sidebar
 * open/close. This eliminates manual position calculations and provides better
 * encapsulation between components.
 *
 * Props:
 *   campaignId - Campaign to connect to.
 *   seatId     - (dev only) Seat override forwarded to wsClient.connect().
 *                DEV HACK: remove `seatId` prop after Phase 5 (real player auth).
 *
 * Forced password-change modal: when `authState.me.mustChangePassword` is true,
 * a blocking overlay is shown that the player cannot dismiss. The player must
 * submit a new password before the game loads. On success `authState.loadMe()`
 * refreshes the flag.
 */

import { onMount } from 'svelte';
import { wsClient, api } from '../../api/index.js';
import PlayLayoutBase from './PlayLayoutBase.svelte';
import PlayLayoutOverlay from './PlayLayoutOverlay.svelte';
import { FloatingWindowLayer } from '../window';
import { ContextMenu } from '../canvas';
import { authState } from '../../state/auth.svelte.js';

// DEV HACK: seatId prop threads the ?seat= bypass down from Router.
// Remove seatId after Phase 5 (real player auth).
let {
  campaignId,
  seatId,
}: { campaignId?: string; seatId?: string } = $props();

// ── Forced-change-password modal state ──────────────────────────────────────
let currentPassword = $state('');
let newPassword = $state('');
let confirmPassword = $state('');
let pwChangeLoading = $state(false);
let pwChangeError = $state<string | null>(null);
let pwChangeSuccess = $state(false);

async function handlePasswordChange(event: Event) {
  event.preventDefault();
  pwChangeError = null;

  if (newPassword.length < 8) {
    pwChangeError = 'New password must be at least 8 characters.';
    return;
  }
  if (newPassword !== confirmPassword) {
    pwChangeError = 'Passwords do not match.';
    return;
  }

  pwChangeLoading = true;
  try {
    await api.auth.changePassword({ currentPassword, newPassword });
    pwChangeSuccess = true;
    await authState.loadMe();
    // loadMe() will clear mustChangePassword; the modal unmounts reactively
  } catch {
    pwChangeError = 'Incorrect current password or server error. Try again.';
  } finally {
    pwChangeLoading = false;
  }
}
// ────────────────────────────────────────────────────────────────────────────

onMount(() => {
  wsClient.connect(campaignId, seatId);
  return () => wsClient.disconnect();
});
</script>

{#if authState.me?.mustChangePassword && !pwChangeSuccess}
  <!-- Blocking password-change overlay — cannot be dismissed -->
  <div class="pw-change-backdrop" role="dialog" aria-modal="true" aria-labelledby="pw-change-title">
    <div class="pw-change-card">
      <h2 id="pw-change-title">Change your password</h2>
      <p>Your account requires a password change before you can continue.</p>
      <form onsubmit={handlePasswordChange}>
        <div class="pw-form-group">
          <label for="pw-current">Current password</label>
          <input
            type="password"
            id="pw-current"
            bind:value={currentPassword}
            disabled={pwChangeLoading}
            autocomplete="current-password"
          />
        </div>
        <div class="pw-form-group">
          <label for="pw-new">New password</label>
          <input
            type="password"
            id="pw-new"
            bind:value={newPassword}
            disabled={pwChangeLoading}
            autocomplete="new-password"
            minlength="8"
          />
        </div>
        <div class="pw-form-group">
          <label for="pw-confirm">Confirm new password</label>
          <input
            type="password"
            id="pw-confirm"
            bind:value={confirmPassword}
            disabled={pwChangeLoading}
            autocomplete="new-password"
          />
        </div>
        {#if pwChangeError}
          <div class="pw-error" role="alert">{pwChangeError}</div>
        {/if}
        <button type="submit" class="pw-submit" disabled={pwChangeLoading}>
          {pwChangeLoading ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  </div>
{/if}

<div class="play-layout">
  <!-- Skip link: off-screen by default, appears on keyboard focus. -->
  <a class="skip-link" href="#main-content">Skip to canvas</a>

  <!-- Layer 1: Base (toolbar + canvas background) -->
  <PlayLayoutBase />

  <!-- Layer 2: Overlay (drawer + canvas overlays + sidebar) -->
  <PlayLayoutOverlay />

  <!-- Layer 3: Floating windows -->
  <FloatingWindowLayer />

  <!-- Layer 4: Context menu (above floating windows) -->
  <ContextMenu />
</div>

<style>
  .play-layout {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: var(--color-bg-primary);
  }

  .skip-link {
    position: absolute;
    top: -100%;
    left: 0;
    z-index: 9999;
    padding: 0.5rem 1rem;
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    text-decoration: none;
    border-radius: 0 0 var(--radius-sm) 0;
  }

  .skip-link:focus {
    top: 0;
  }

  /* ── Forced password-change modal ─────────────────────────────────────── */
  .pw-change-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.75);
  }

  .pw-change-card {
    width: 100%;
    max-width: 420px;
    padding: var(--space-2xl);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .pw-change-card h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
  }

  .pw-change-card p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .pw-change-card form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .pw-form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .pw-form-group label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .pw-form-group input {
    padding: var(--space-sm) var(--space-md);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  .pw-error {
    font-size: var(--font-size-sm);
    color: var(--color-danger, #dc2626);
  }

  .pw-submit {
    padding: var(--space-md) var(--space-xl);
    background: var(--color-accent-primary, var(--color-primary));
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-on-primary, #fff);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .pw-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>

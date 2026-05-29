<script lang="ts">
/**
 * SplashPage — root landing page (`/`).
 *
 * Shown to all visitors at `/`. Provides entry points to the Play area,
 * Account page, and Admin panel. No auto-redirect; the user chooses where
 * to go.
 *
 * @see docs/decisions/010-player-account-model.md
 */

import { navigate } from '../../app/routes.js';
</script>

<div class="centered-page">
  <div class="splash-card">
    <h1 class="logo">HearthVTT</h1>
    <p class="tagline">Your virtual tabletop</p>

    <div class="actions">
      <button class="btn btn-primary" onclick={() => navigate('/play')}>
        Play
      </button>
      <button class="btn btn-secondary" onclick={() => navigate('/play/account')}>
        Account
      </button>
      <button class="btn btn-ghost" onclick={() => navigate('/admin')}>
        Admin
      </button>
    </div>
  </div>
</div>

<style>
  .splash-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-3xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    text-align: center;
    min-width: 320px;
  }

  .logo {
    margin: 0;
    font-size: var(--font-size-4xl, 2.5rem);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .tagline {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    width: 100%;
  }

  .btn {
    padding: var(--space-md) var(--space-xl);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    border: none;
    transition: opacity 0.15s;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: var(--color-on-primary, #fff);
  }

  .btn-secondary {
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-default);
  }

  .btn-ghost {
    background-color: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-subtle, var(--color-border-default));
  }
</style>

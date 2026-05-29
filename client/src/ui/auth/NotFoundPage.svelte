<script lang="ts">
/**
 * NotFoundPage — 404 fallback (`/not-found` or any unmatched route).
 *
 * Shown when the router cannot match the current pathname.
 * Provides a "Back to Play" button to return the user to a known-good route.
 *
 * @see client/src/app/routes.ts parseRoute (not-found type)
 */

import { navigate } from '../../app/routes.js';
</script>

<div class="centered-page">
  <div class="content-card">
    <div class="icon" aria-hidden="true">404</div>
    <h1>Page Not Found</h1>
    <p class="description">
      The page you're looking for doesn't exist or you don't have access to it.
    </p>
    <button class="btn-back" onclick={() => navigate('/play')}>
      Back to /play
    </button>
  </div>
</div>

<style>
  .content-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-3xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    text-align: center;
    max-width: 480px;
    width: 100%;
  }

  .icon {
    font-size: var(--font-size-4xl, 3rem);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-muted, var(--color-text-secondary));
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .description {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
  }

  .btn-back {
    padding: var(--space-sm) var(--space-xl);
    background-color: var(--color-bg-tertiary);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-back:hover {
    opacity: 0.85;
  }
</style>

<script lang="ts">
/**
 * PlayLoginPage — player login form (`/play/login`).
 *
 * Accepts `?returnTo=<same-origin-path>` and redirects there on success.
 * Falls back to `/play` when returnTo is absent or invalid.
 *
 * Password-reset assistance: displays a static "Ask your admin" message
 * (no self-service reset in this phase).
 *
 * @see docs/decisions/010-player-account-model.md
 * @see docs/components/auth-join-flow.md
 */

import { navigate } from '../../app/routes.js';
import { api } from '../../api/http.js';
import { ApiError } from '../../api/http.js';
import { authState } from '../../state/auth.svelte.js';

interface Props {
  returnTo: string | null;
}

let { returnTo }: Props = $props();

let username = $state('');
let password = $state('');
let isLoading = $state(false);
let error = $state<string | null>(null);
let showForgotPassword = $state(false);

async function handleSubmit(event: Event) {
  event.preventDefault();
  if (!username || !password) {
    error = 'Please enter your username and password.';
    return;
  }

  isLoading = true;
  error = null;

  try {
    const me = await api.auth.login(username, password);
    authState.me = me;
    authState.csrfToken = me.csrfToken;
    navigate(returnTo ?? '/play');
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        error = 'Invalid username or password.';
      } else if (err.status === 429) {
        error = 'Too many login attempts. Please wait a moment and try again.';
      } else {
        error = 'An error occurred. Please try again.';
      }
    } else {
      error = 'Could not connect to the server. Please try again.';
    }
  } finally {
    isLoading = false;
  }
}
</script>

<div class="centered-page">
  <div class="login-card">
    <h1>Sign In</h1>

    <form onsubmit={handleSubmit}>
      <div class="form-group">
        <label for="username">Username</label>
        <input
          id="username"
          type="text"
          autocomplete="username"
          bind:value={username}
          disabled={isLoading}
          placeholder="Your username"
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          disabled={isLoading}
          placeholder="Your password"
        />
      </div>

      {#if error}
        <div class="error-banner" role="alert">{error}</div>
      {/if}

      <button type="submit" class="btn-submit" disabled={isLoading}>
        {isLoading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>

    <div class="forgot">
      <button
        type="button"
        class="link-btn"
        onclick={() => (showForgotPassword = !showForgotPassword)}
      >
        I forgot my password
      </button>

      {#if showForgotPassword}
        <div class="forgot-message" role="status">
          Password resets are handled by your admin. Ask them to reset your
          password in the Admin panel.
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .login-card {
    width: 100%;
    max-width: 400px;
    padding: var(--space-2xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    text-align: center;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
  }

  input {
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-base);
  }

  input:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  .error-banner {
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-error-bg, #fee2e2);
    color: var(--color-error, #dc2626);
    border: 1px solid var(--color-error-border, #fca5a5);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
  }

  .btn-submit {
    padding: var(--space-md);
    background-color: var(--color-primary);
    color: var(--color-on-primary, #fff);
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-submit:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .forgot {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    text-align: center;
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--color-text-link, var(--color-primary));
    cursor: pointer;
    font-size: var(--font-size-sm);
    text-decoration: underline;
    padding: 0;
  }

  .forgot-message {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
  }
</style>

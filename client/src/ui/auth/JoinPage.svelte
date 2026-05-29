<script lang="ts">
/**
 * JoinPage - Invite claim interface.
 *
 * Renders a form to claim an invite using a token and PIN.
 *
 * Supports two modes:
 * - `register` — new player; requires username + password to create an account
 * - `login`    — existing player; uses existing account credentials
 *
 * On success, navigates to `/play/<campaignId>`.
 *
 * @see shared/src/protocol/http.ts ClaimInviteRequest
 * @see docs/components/auth-join-flow.md
 * @see docs/decisions/010-player-account-model.md
 */

import { navigate } from '../../app/routes.js';
import { api, ApiError } from '../../api/http.js';
import { authState } from '../../state/auth.svelte.js';

interface Props {
  token: string;
}

let { token }: Props = $props();

type Mode = 'register' | 'login';

let mode = $state<Mode>('register');
let pin = $state('');
let username = $state('');
let password = $state('');
let isLoading = $state(false);
let error = $state<string | null>(null);
let success = $state(false);

function toggleMode() {
  mode = mode === 'register' ? 'login' : 'register';
  error = null;
}

async function handleSubmit(event: Event) {
  event.preventDefault();

  if (!pin || pin.length < 4) {
    error = 'Please enter a valid PIN (4+ digits).';
    return;
  }

  if (!username || username.length < 2) {
    error = 'Please enter a username (2+ characters).';
    return;
  }

  if (!password || password.length < 8) {
    error = 'Please enter a password (8+ characters).';
    return;
  }

  isLoading = true;
  error = null;

  try {
    const result = await api.auth.claimInvite({
      mode,
      inviteToken: token,
      pin,
      username,
      password,
    });

    // Refresh session state so downstream pages see the new account
    await authState.loadMe();

    success = true;

    // Navigate to the campaign after a brief success flash
    setTimeout(() => {
      navigate(`/play/${result.campaignId}`);
    }, 1200);
  } catch (err) {
    if (err instanceof ApiError) {
      switch (err.status) {
        case 400:
          error = 'This invite link is invalid or has expired.';
          break;
        case 401:
          error = 'Incorrect PIN. Please check with your Game Master.';
          break;
        case 409:
          error =
            mode === 'register'
              ? 'That username is already taken. Try logging in instead.'
              : 'Account not found. Try registering instead.';
          break;
        case undefined:
          // HttpClient wraps network failures as ApiError with code NETWORK_ERROR
          if (err.code === 'NETWORK_ERROR') {
            error = 'Could not connect to the server. Please try again.';
          } else {
            error = 'An error occurred. Please try again.';
          }
          break;
        default:
          error = 'An error occurred. Please try again.';
      }
    } else {
      error = 'Could not connect to the server. Please try again.';
    }
    isLoading = false;
  }
}
</script>

<div class="centered-page">
  <div class="join-card">
    <div class="card-header">
      <h1>Join HearthVTT</h1>
      <p>You've been invited to join a campaign</p>
    </div>

    {#if success}
      <div class="success-message">
        <div class="success-icon" aria-hidden="true">✓</div>
        <h2>Welcome!</h2>
        <p>You have joined the campaign successfully.</p>
        <p class="redirect-text">Redirecting to campaign…</p>
      </div>
    {:else}
      <!-- Mode toggle -->
      <div class="mode-toggle" role="group" aria-label="Account mode">
        <button
          type="button"
          class="mode-btn"
          class:active={mode === 'register'}
          onclick={() => { mode = 'register'; error = null; }}
          aria-pressed={mode === 'register'}
        >
          New player
        </button>
        <button
          type="button"
          class="mode-btn"
          class:active={mode === 'login'}
          onclick={() => { mode = 'login'; error = null; }}
          aria-pressed={mode === 'login'}
        >
          Existing account
        </button>
      </div>

      <form onsubmit={handleSubmit}>
        <!-- Invite token (read-only) -->
        <div class="form-group">
          <label for="token">Invite Token</label>
          <input
            type="text"
            id="token"
            value={token}
            readonly
            class="readonly-input"
          />
        </div>

        <!-- PIN -->
        <div class="form-group">
          <label for="pin">PIN</label>
          <input
            type="password"
            id="pin"
            placeholder="Enter PIN from your GM"
            bind:value={pin}
            disabled={isLoading}
            autocomplete="off"
          />
        </div>

        <!-- Username -->
        <div class="form-group">
          <label for="username">Username</label>
          <input
            type="text"
            id="username"
            placeholder={mode === 'register' ? 'Choose a username' : 'Your username'}
            bind:value={username}
            disabled={isLoading}
            autocomplete="username"
          />
        </div>

        <!-- Password -->
        <div class="form-group">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            placeholder={mode === 'register' ? 'Choose a password (8+ chars)' : 'Your password'}
            bind:value={password}
            disabled={isLoading}
            autocomplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
        </div>

        {#if error}
          <div class="error-message" role="alert">
            <strong>Error:</strong>
            {error}
          </div>
        {/if}

        <button type="submit" class="submit-button" disabled={isLoading}>
          {#if isLoading}
            {mode === 'register' ? 'Creating account…' : 'Signing in…'}
          {:else}
            {mode === 'register' ? 'Create account & join' : 'Sign in & join'}
          {/if}
        </button>
      </form>

      <p class="mode-hint">
        {#if mode === 'register'}
          Already have an account?
          <button type="button" class="link-btn" onclick={toggleMode}>Sign in instead</button>
        {:else}
          No account yet?
          <button type="button" class="link-btn" onclick={toggleMode}>Register instead</button>
        {/if}
      </p>
    {/if}
  </div>
</div>

<style>
  .join-card {
    width: 100%;
    max-width: 500px;
    padding: var(--space-2xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .card-header {
    text-align: center;
  }

  .card-header h1 {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent-primary);
  }

  .card-header p {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
  }

  /* Mode toggle */
  .mode-toggle {
    display: flex;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .mode-btn {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    transition: background-color 0.15s, color 0.15s;
  }

  .mode-btn.active {
    background-color: var(--color-accent-primary, var(--color-primary));
    color: var(--color-on-primary, #fff);
  }

  /* Form */
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
    outline: 2px solid var(--color-accent-primary, var(--color-primary));
    outline-offset: 1px;
  }

  .readonly-input {
    background-color: var(--color-bg-tertiary);
    cursor: default;
    opacity: 0.7;
  }

  .error-message {
    padding: var(--space-md);
    background-color: var(--color-danger-faint, #fee2e2);
    border: 1px solid var(--color-danger, #dc2626);
    border-radius: var(--radius-sm);
    color: var(--color-danger, #dc2626);
    font-size: var(--font-size-sm);
  }

  .submit-button {
    padding: var(--space-md) var(--space-xl);
    background-color: var(--color-accent-primary, var(--color-primary));
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-on-primary, #fff);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .submit-button:hover:not(:disabled) {
    opacity: 0.85;
  }

  .submit-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Success */
  .success-message {
    text-align: center;
    padding: var(--space-xl) 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }

  .success-icon {
    width: 64px;
    height: 64px;
    background-color: var(--color-success, #16a34a);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-2xl);
    color: #fff;
  }

  .success-message h2 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .success-message p {
    margin: 0;
    color: var(--color-text-secondary);
  }

  .redirect-text {
    font-size: var(--font-size-sm);
    font-style: italic;
  }

  /* Mode hint */
  .mode-hint {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--color-accent-primary, var(--color-primary));
    cursor: pointer;
    font-size: var(--font-size-sm);
    text-decoration: underline;
    padding: 0;
  }
</style>

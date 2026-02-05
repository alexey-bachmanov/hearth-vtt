<script lang="ts">
/**
 * JoinPage - Invite claim interface.
 * 
 * Renders form to claim an invite using a token and PIN.
 * Handles expired, already claimed, and wrong PIN error states.
 */

import { onMount } from 'svelte';

interface Props {
  token: string;
}

let { token }: Props = $props();

let pin = $state('');
let isLoading = $state(false);
let error = $state<string | null>(null);
let success = $state(false);

onMount(() => {
  // TODO: Validate token exists before showing form
  console.log('JoinPage mounted with token:', token);
});

async function handleSubmit(event: Event) {
  event.preventDefault();
  
  if (!pin || pin.length < 4) {
    error = 'Please enter a valid PIN';
    return;
  }

  isLoading = true;
  error = null;

  try {
    // TODO: Call POST /api/auth/claim-invite
    console.log('Claiming invite:', { token, pin });
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock success - TODO: Handle actual response
    success = true;
    
    // Redirect to /play after successful claim
    setTimeout(() => {
      window.location.href = '/play';
    }, 2000);
  } catch (err: any) {
    // Handle various error cases
    if (err.status === 404) {
      error = 'Invite not found or has expired';
    } else if (err.status === 409) {
      error = 'This invite has already been claimed';
    } else if (err.status === 403) {
      error = 'Incorrect PIN';
    } else {
      error = 'An error occurred. Please try again.';
    }
  } finally {
    isLoading = false;
  }
}
</script>

<div class="join-page">
  <div class="join-card">
    <div class="card-header">
      <h1>Join HearthVTT</h1>
      <p>You've been invited to join a campaign</p>
    </div>

    {#if success}
      <div class="success-message">
        <div class="success-icon">✓</div>
        <h2>Welcome!</h2>
        <p>Your invite has been claimed successfully.</p>
        <p class="redirect-text">Redirecting to campaign...</p>
      </div>
    {:else}
      <form onsubmit={handleSubmit}>
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

        <div class="form-group">
          <label for="pin">Enter PIN</label>
          <input 
            type="password" 
            id="pin" 
            placeholder="Enter 4+ digit PIN" 
            bind:value={pin}
            disabled={isLoading}
            autocomplete="off"
          />
          <span class="help-text">
            Your GM should have provided you with a PIN
          </span>
        </div>

        {#if error}
          <div class="error-message">
            <strong>Error:</strong> {error}
          </div>
        {/if}

        <button type="submit" class="submit-button" disabled={isLoading}>
          {#if isLoading}
            Claiming...
          {:else}
            Claim Invite
          {/if}
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .join-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-xl);
    background-color: var(--color-bg-primary);
  }

  .join-card {
    width: 100%;
    max-width: 500px;
    padding: var(--space-2xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-large);
  }

  .card-header {
    text-align: center;
    margin-bottom: var(--space-2xl);
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

  .success-message {
    text-align: center;
    padding: var(--space-xl) 0;
  }

  .success-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto var(--space-lg);
    background-color: var(--color-success);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-3xl);
    color: white;
  }

  .success-message h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .success-message p {
    margin: 0 0 var(--space-xs) 0;
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
  }

  .redirect-text {
    margin-top: var(--space-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .form-group label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .form-group input {
    padding: var(--space-md);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
    transition: border-color var(--transition-fast);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
  }

  .form-group input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .readonly-input {
    background-color: var(--color-bg-tertiary);
    cursor: default;
  }

  .help-text {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .error-message {
    padding: var(--space-md);
    background-color: rgba(244, 67, 54, 0.1);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-sm);
    color: var(--color-danger);
    font-size: var(--font-size-sm);
  }

  .error-message strong {
    font-weight: var(--font-weight-semibold);
  }

  .submit-button {
    padding: var(--space-md) var(--space-xl);
    background-color: var(--color-accent-primary);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .submit-button:hover:not(:disabled) {
    background-color: var(--color-accent-hover);
  }

  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>

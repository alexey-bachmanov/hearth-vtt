<script lang="ts">
/**
 * AdminSetup - First-time server admin setup page.
 * 
 * Workflow:
 * 1. On mount, check if setup is needed via GET /api/admin/check-setup
 * 2. If setup already complete, redirect to /admin
 * 3. If setup needed, show PIN entry form
 * 4. User enters PIN from admin-setup-pin.txt (generated on server startup)
 * 5. User optionally sets a password (recommended for returning access)
 * 6. On submit, POST /api/admin/setup with PIN and optional password
 * 7. Server validates PIN, creates admin account, returns session cookie
 * 8. Redirect to /admin on success
 * 
 * Error handling:
 * - Invalid or expired PIN: Show error with instructions to check logs/restart server
 * - Network errors: Show retry button
 */

import { onMount } from 'svelte';
import { navigate } from '../../app/routes';
import { adminAuth } from '../../state/admin.svelte';

type SetupStatus = 'checking' | 'needs-setup' | 'already-setup';

let status = $state<SetupStatus>('checking');
let pin = $state('');
let password = $state('');
let confirmPassword = $state('');
let errorMessage = $state('');
let isSubmitting = $state(false);

/**
 * Check if server admin setup is needed.
 * Redirects to /admin if setup is already complete.
 */
async function checkSetupStatus() {
  try {
    const response = await fetch('/api/admin/check-setup', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to check setup status');
    }

    const data = await response.json();

    if (data.needsSetup === false) {
      // Setup already complete, redirect to admin
      status = 'already-setup';
      navigate('/admin');
    } else {
      // Setup needed, show form
      status = 'needs-setup';
    }
  } catch {
    errorMessage = 'Failed to connect to server. Please ensure the server is running.';
    status = 'needs-setup'; // Allow retry
  }
}

/**
 * Submit setup form with PIN and optional password.
 * Creates admin account and establishes authenticated session.
 */
async function handleSubmit() {
  // Reset error
  errorMessage = '';

  // Validate PIN
  if (!pin || pin.trim().length === 0) {
    errorMessage = 'Please enter the setup PIN';
    return;
  }

  // Validate password (now mandatory)
  if (!password || password.trim().length === 0) {
    errorMessage = 'Password is required';
    return;
  }

  if (password !== confirmPassword) {
    errorMessage = 'Passwords do not match';
    return;
  }

  if (password.length < 8) {
    errorMessage = 'Password must be at least 8 characters';
    return;
  }

  isSubmitting = true;

  try {
    const response = await fetch('/api/admin/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        setupPin: pin.trim(),
        newPassword: password,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      
      if (response.status === 400) {
        errorMessage = data.error || 'Invalid PIN';
      } else if (response.status === 410) {
        errorMessage = 'Setup PIN has expired. Please restart the server to generate a new PIN.';
      } else {
        errorMessage = 'Setup failed. Please check the server logs.';
      }
      
      isSubmitting = false;
      return;
    }

    // Setup successful! Store CSRF token and redirect to admin
    const data = await response.json();
    if (data.csrfToken) {
      adminAuth.setCsrfToken(data.csrfToken);
    }
    navigate('/admin');
  } catch {
    errorMessage = 'Failed to connect to server. Please ensure the server is running.';
    isSubmitting = false;
  }
}

onMount(() => {
  checkSetupStatus();
});
</script>

<div class="centered-page">
  {#if status === 'checking'}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Checking setup status...</p>
    </div>
  {:else if status === 'needs-setup'}
    <div class="setup-card">
      <div class="setup-header">
        <h1>Server Admin Setup</h1>
        <p class="subtitle">
          Welcome! This server needs to be configured with an admin account.
        </p>
      </div>

      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <!-- PIN Input -->
        <div class="form-section">
          <h2>Step 1: Enter Setup PIN</h2>
          <p class="help-text">
            The setup PIN was generated when the server started. Check the file 
            <code>admin-setup-pin.txt</code> in the server's data directory, or look 
            for it in the server console logs.
          </p>
          
          <label for="pin">Setup PIN</label>
          <input
            id="pin"
            type="text"
            bind:value={pin}
            placeholder="8-character PIN"
            maxlength="8"
            disabled={isSubmitting}
            required
          />
        </div>

        <!-- Password Input (Required) -->
        <div class="form-section">
          <h2>Step 2: Set Admin Password</h2>
          <p class="help-text">
            Set a password to secure your admin account. You'll use this to log in after setup.
          </p>
          
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            placeholder="At least 8 characters"
            minlength="8"
            disabled={isSubmitting}
            required
          />

          <label for="confirm-password">Confirm Password</label>
          <input
            id="confirm-password"
            type="password"
            bind:value={confirmPassword}
            placeholder="Re-enter password"
            disabled={isSubmitting}
            required
          />
        </div>

        <!-- Error Message -->
        {#if errorMessage}
          <div class="banner banner--error">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        {/if}

        <!-- Submit Button -->
        <button
          type="submit"
          class="btn btn--primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Setting up...' : 'Complete Setup'}
        </button>
      </form>

      <!-- Help Section -->
      <div class="help-section">
        <h3>Need help?</h3>
        <ul>
          <li>The setup PIN is valid for 24 hours</li>
          <li>If the PIN has expired, restart the server to generate a new one</li>
          <li>The PIN file is located in: <code>data/admin-setup-pin.txt</code></li>
          <li>Choose a strong password with at least 8 characters</li>
        </ul>
      </div>
    </div>
  {/if}
</div>


<style>
  /* Card-specific adjustments for setup (wider than login) */
  .setup-card {
    max-width: 600px;
    width: 100%;
    padding: var(--space-2xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  /* Setup header section */
  .setup-header {
    margin-bottom: var(--space-2xl);
    text-align: center;
  }

  .setup-header h1 {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent-primary);
  }

  /* Section headers within form */
  .form-section h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  /* Special styling for PIN input (monospace, uppercase) */
  input[type="text"] {
    font-family: monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* Help section at bottom of card */
  .help-section {
    margin-top: var(--space-xl);
    padding-top: var(--space-xl);
    border-top: 1px solid var(--color-border-default);
  }

  .help-section h3 {
    margin: 0 0 var(--space-md) 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .help-section ul {
    margin: 0;
    padding-left: var(--space-lg);
    list-style-type: disc;
  }

  .help-section li {
    margin-bottom: var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    line-height: 1.5;
  }

  .help-section code {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-xs);
    font-family: monospace;
    font-size: var(--font-size-xs);
    color: var(--color-accent-primary);
  }
</style>

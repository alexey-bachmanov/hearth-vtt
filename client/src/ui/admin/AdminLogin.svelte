<script lang="ts">
/**
 * AdminLogin - Login page for returning server admins.
 *
 * Workflow:
 * 1. On mount, check if user is already authenticated
 * 2. If authenticated (valid session cookie), redirect to /admin
 * 3. If not authenticated, show password login form
 * 4. User enters their admin password
 * 5. On submit, POST /api/admin/login with password
 * 6. Server validates password, creates session, returns cookie
 * 7. Redirect to /admin on success
 *
 * Error handling:
 * - Invalid password: Show error message
 * - Server not setup: Redirect to /admin/setup
 * - Network errors: Show retry button
 */

import { onMount } from 'svelte';
import { navigate } from '../../app/routes';
import { adminAuth } from '../../state/admin.svelte';

type AuthStatus = 'checking' | 'needs-login' | 'authenticated';

let status = $state<AuthStatus>('checking');
let password = $state('');
let errorMessage = $state('');
let isSubmitting = $state(false);

/**
 * Check if user is already authenticated with a valid session.
 * Redirects to /admin if session is valid.
 */
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/admin/check-auth', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      // Network error or server issue
      status = 'needs-login';
      return;
    }

    const data = await response.json();

    if (data.needsSetup === true) {
      // Server needs setup, redirect to setup page
      navigate('/admin/setup');
      return;
    }

    if (data.authenticated === true) {
      // Already authenticated, redirect to admin
      navigate('/admin');
      return;
    }

    // Not authenticated, show login form
    status = 'needs-login';
  } catch (error) {
    // Network error or server down
    errorMessage = 'Failed to connect to server. Please ensure the server is running.';
    status = 'needs-login';
  }
}

/**
 * Submit login form with password.
 * Authenticates admin and establishes session.
 */
async function handleSubmit() {
  // Reset error
  errorMessage = '';

  // Validate password
  if (!password || password.trim().length === 0) {
    errorMessage = 'Please enter your password';
    return;
  }

  isSubmitting = true;

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        password: password,
      }),
    });
    
    if (!response.ok) {
      const data = await response.json();

      if (response.status === 401) {
        errorMessage = 'Invalid password. Please try again.';
      } else if (response.status === 400 && data.error?.includes('not set up')) {
        // Server admin not set up yet, redirect to setup
        navigate('/admin/setup');
        return;
      } else {
        errorMessage = data.error || 'Login failed. Please try again.';
      }

      isSubmitting = false;
      return;
    }

    // Login successful! Store CSRF token and redirect to admin
    const data = await response.json();
    if (data.csrfToken) {
      adminAuth.setCsrfToken(data.csrfToken);
    }
    navigate('/admin');
  } catch (error) {
    errorMessage = 'Failed to connect to server. Please ensure the server is running.';
    isSubmitting = false;
  }
}

onMount(() => {
  checkAuthStatus();
});
</script>

<div class="login-page">
  {#if status === 'checking'}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Checking authentication...</p>
    </div>
  {:else if status === 'needs-login'}
    <div class="login-card">
      <div class="login-header">
        <h1>Server Admin Login</h1>
        <p class="subtitle">
          Enter your admin password to access the server management panel.
        </p>
      </div>

      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            placeholder="Enter your admin password"
            disabled={isSubmitting}
            required
          />
        </div>

        {#if errorMessage}
          <div class="error-banner">
            <span class="error-icon">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        {/if}

        <button
          type="submit"
          class="btn btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <div class="help-section">
        <p>
          Don't have a password? If this is your first time setting up the server,
          use the <a href="/admin/setup">setup page</a> with the PIN from your server logs.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    background: linear-gradient(135deg, var(--color-bg-primary) 0%, var(--color-bg-secondary) 100%);
  }

  .loading-state {
    text-align: center;
    color: var(--color-text-secondary);
  }

  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto var(--space-md);
    border: 3px solid var(--color-border-default);
    border-top-color: var(--color-accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .login-card {
    max-width: 450px;
    width: 100%;
    padding: var(--space-2xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-large);
  }

  .login-header {
    margin-bottom: var(--space-2xl);
    text-align: center;
  }

  .login-header h1 {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent-primary);
  }

  .subtitle {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  input {
    padding: var(--space-md);
    background-color: var(--color-bg-primary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
    font-family: inherit;
    transition: border-color var(--transition-fast);
  }

  input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-sm);
    color: var(--color-error, #ef4444);
    font-size: var(--font-size-sm);
  }

  .error-icon {
    font-size: var(--font-size-lg);
  }

  .btn {
    padding: var(--space-md) var(--space-xl);
    background-color: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn:hover {
    background-color: var(--color-bg-primary);
  }

  .btn-primary {
    background-color: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: white;
  }

  .btn-primary:hover {
    background-color: var(--color-accent-secondary, var(--color-accent-primary));
    border-color: var(--color-accent-secondary, var(--color-accent-primary));
    transform: translateY(-1px);
    box-shadow: var(--shadow-medium);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .help-section {
    margin-top: var(--space-xl);
    padding-top: var(--space-xl);
    border-top: 1px solid var(--color-border-default);
    text-align: center;
  }

  .help-section p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    line-height: 1.5;
  }

  .help-section a {
    color: var(--color-accent-primary);
    text-decoration: none;
    font-weight: var(--font-weight-medium);
  }

  .help-section a:hover {
    text-decoration: underline;
  }
</style>

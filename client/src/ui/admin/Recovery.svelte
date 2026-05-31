<script lang="ts">
/**
 * AdminRecovery - Admin password recovery page.
 *
 * Workflow:
 * 1. Operator creates an empty `admin-reset.flag` file in the server's data
 *    directory (path shown in the instructions).
 * 2. Operator navigates here and clicks "Check again".
 * 3. Client calls POST /api/admin/reset.
 *    - 200 → flag found, password reset; navigate to /admin/setup.
 *    - 404 → flag not yet present; show "Flag not found" message.
 *    - 500 → server couldn't delete the flag; show server error.
 *    - 429 → rate limited; show retry message.
 */

import { navigate } from '../../app/routes';
import { api } from '../../api/http';
import { ApiError } from '../../api/http';

type CheckState = 'idle' | 'checking' | 'not-found' | 'error' | 'rate-limited';

let checkState = $state<CheckState>('idle');
let errorMessage = $state('');

/**
 * Call POST /api/admin/reset and handle the result.
 */
async function handleCheck() {
  checkState = 'checking';
  errorMessage = '';

  try {
    await api.adminAuth.requestReset();
    // 200 — flag found, reset complete, navigate to setup
    navigate('/admin/setup');
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        checkState = 'not-found';
      } else if (err.status === 429) {
        checkState = 'rate-limited';
        errorMessage = 'Too many attempts. Please wait before trying again.';
      } else {
        checkState = 'error';
        errorMessage =
          err.message ||
          'Server error while processing the reset request. Check that the flag file is readable and try again.';
      }
    } else {
      checkState = 'error';
      errorMessage = 'Failed to connect to server. Ensure the server is running.';
    }
  }
}
</script>

<div class="centered-page">
  <div class="recovery-card">
    <div class="recovery-header">
      <h1>Admin Password Recovery</h1>
      <p class="subtitle">
        Forgot your admin password? You can reset it without logging in, as long
        as you have access to the server's data directory.
      </p>
    </div>

    <div class="instructions">
      <h2>How to reset</h2>
      <ol>
        <li>
          On the machine running the server, create an empty file named
          <code>admin-reset.flag</code> inside the server's
          <strong>data directory</strong>.
          <div class="data-dir-hint">
            See <a href="https://github.com/alexey-bachmanov/hearth-vtt/blob/main/docs/components/server.md#data-directory-paths-by-deployment" target="_blank" rel="noopener noreferrer">server deployment docs</a> for the exact path.
            Common locations:
            <ul>
              <li><strong>Raw npm start:</strong> <code>./data/admin-reset.flag</code></li>
              <li><strong>Docker:</strong> <code>/data/admin-reset.flag</code></li>
              <li><strong>Installer / .exe:</strong> next to the executable in <code>data/admin-reset.flag</code></li>
            </ul>
          </div>
        </li>
        <li>Click <strong>"Check again"</strong> below. The server will verify the flag, revoke all admin sessions, and generate a new setup PIN.</li>
        <li>You will be redirected to the setup page to enter the new PIN and set a new password.</li>
      </ol>
    </div>

    {#if checkState === 'not-found'}
      <div class="banner banner--warning" role="alert">
        <span>⚠️</span>
        <span>Flag not found. Create <code>admin-reset.flag</code> in the data directory, then try again.</span>
      </div>
    {:else if checkState === 'error'}
      <div class="banner banner--error" role="alert">
        <span>⚠️</span>
        <span>{errorMessage}</span>
      </div>
    {:else if checkState === 'rate-limited'}
      <div class="banner banner--error" role="alert">
        <span>⚠️</span>
        <span>{errorMessage}</span>
      </div>
    {/if}

    <div class="actions">
      <button
        class="btn btn--primary"
        onclick={handleCheck}
        disabled={checkState === 'checking'}
      >
        {checkState === 'checking' ? 'Checking…' : 'Check again'}
      </button>

      <a href="/admin/login" class="btn btn--secondary" onclick={(e) => { e.preventDefault(); navigate('/admin/login'); }}>
        Back to login
      </a>
    </div>
  </div>
</div>

<style>
  .recovery-card {
    max-width: 560px;
    width: 100%;
    padding: var(--space-2xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .recovery-header {
    margin-bottom: var(--space-xl);
    text-align: center;
  }

  .recovery-header h1 {
    margin: 0 0 var(--space-sm) 0;
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent-primary);
  }

  .instructions {
    margin-bottom: var(--space-xl);
  }

  .instructions h2 {
    margin: 0 0 var(--space-md) 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .instructions ol {
    margin: 0;
    padding-left: var(--space-xl);
  }

  .instructions li {
    margin-bottom: var(--space-md);
    line-height: 1.6;
  }

  .data-dir-hint {
    margin-top: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .data-dir-hint ul {
    margin: var(--space-xs) 0 0 0;
    padding-left: var(--space-lg);
  }

  .data-dir-hint li {
    margin-bottom: var(--space-xs);
  }

  .actions {
    display: flex;
    gap: var(--space-md);
    flex-wrap: wrap;
    margin-top: var(--space-xl);
  }
</style>

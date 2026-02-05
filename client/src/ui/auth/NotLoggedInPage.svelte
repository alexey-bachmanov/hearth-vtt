<script lang="ts">
/**
 * NotLoggedInPage - Unauthenticated access page.
 * 
 * Shown when /play or /admin is accessed without a valid session.
 * Provides instructions for obtaining access.
 */
</script>

<div class="not-logged-in-page">
  <div class="content-card">
    <div class="icon">🔒</div>
    
    <h1>Not Logged In</h1>
    
    <p class="description">
      You need to be authenticated to access HearthVTT.
    </p>

    <div class="instructions">
      <h2>How to get access:</h2>
      <ol>
        <li>
          <strong>Request an invite</strong> from your Game Master
        </li>
        <li>
          <strong>Click the invite link</strong> they send you
        </li>
        <li>
          <strong>Enter the PIN</strong> provided by your GM
        </li>
        <li>
          <strong>Start playing!</strong> You'll be redirected to the campaign
        </li>
      </ol>
    </div>

    <div class="info-box">
      <p>
        <strong>Are you a Game Master?</strong> You'll need to set up your campaign
        and create seats for your players before they can join.
      </p>
    </div>
  </div>
</div>

<style>
  .not-logged-in-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-xl);
    background-color: var(--color-bg-primary);
  }

  .content-card {
    width: 100%;
    max-width: 600px;
    padding: var(--space-2xl);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-large);
    text-align: center;
  }

  .icon {
    font-size: 64px;
    margin-bottom: var(--space-lg);
  }

  h1 {
    margin: 0 0 var(--space-md) 0;
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .description {
    margin: 0 0 var(--space-2xl) 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
  }

  .instructions {
    margin-bottom: var(--space-2xl);
    padding: var(--space-xl);
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
    text-align: left;
  }

  .instructions h2 {
    margin: 0 0 var(--space-md) 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .instructions ol {
    margin: 0;
    padding-left: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .instructions li {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .instructions strong {
    color: var(--color-accent-primary);
    font-weight: var(--font-weight-semibold);
  }

  .info-box {
    padding: var(--space-lg);
    background-color: var(--color-bg-elevated);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
  }

  .info-box p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .info-box strong {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-semibold);
  }
</style>

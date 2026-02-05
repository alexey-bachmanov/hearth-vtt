<script lang="ts">
/**
 * Router component for HearthVTT.
 * 
 * Manages client-side routing using the HTML5 History API.
 * Listens to popstate events and reactively renders the correct page.
 * 
 * Routes:
 * - /join/:token → JoinPage
 * - /play → PlayLayout (main game UI)
 * - /admin → AdminLayout (campaign management)
 * - fallback → NotLoggedInPage
 */

import { onMount } from 'svelte';
import { parseRoute, type Route } from './routes';
import PlayLayout from '../ui/layout/PlayLayout.svelte';

// Import placeholder components (will be created in Phase 2+)
// For now, we'll render simple placeholders inline

let currentRoute = $state<Route>(parseRoute(window.location.pathname));

/**
 * Handle browser back/forward navigation.
 */
function handlePopState() {
  currentRoute = parseRoute(window.location.pathname);
}

onMount(() => {
  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', handlePopState);

  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
});
</script>

{#if currentRoute.type === 'join'}
  <div class="route-placeholder">
    <h1>Join Page</h1>
    <p>Invite token: {currentRoute.token}</p>
    <p>This will be replaced with JoinPage component in Phase 4.</p>
  </div>
{:else if currentRoute.type === 'play'}
  <PlayLayout />
{:else if currentRoute.type === 'admin'}
  <div class="route-placeholder">
    <h1>Admin Layout</h1>
    <p>Campaign management interface will be rendered here.</p>
    <p>This will be replaced with AdminLayout component in Phase 3.</p>
  </div>
{:else}
  <div class="route-placeholder">
    <h1>Not Logged In</h1>
    <p>You need to be authenticated to access HearthVTT.</p>
    <p>This will be replaced with NotLoggedInPage component in Phase 4.</p>
  </div>
{/if}

<style>
  .route-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-xl);
    background-color: var(--color-bg-primary);
    color: var(--color-text-primary);
    text-align: center;
  }

  .route-placeholder h1 {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    margin-bottom: var(--space-md);
    color: var(--color-accent-primary);
  }

  .route-placeholder p {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-sm);
    color: var(--color-text-secondary);
  }
</style>

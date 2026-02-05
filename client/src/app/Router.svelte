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
import AdminLayout from '../ui/layout/AdminLayout.svelte';
import JoinPage from '../ui/auth/JoinPage.svelte';
import NotLoggedInPage from '../ui/auth/NotLoggedInPage.svelte';

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
  <JoinPage token={currentRoute.token} />
{:else if currentRoute.type === 'play'}
  <PlayLayout />
{:else if currentRoute.type === 'admin'}
  <AdminLayout />
{:else}
  <NotLoggedInPage />
{/if}

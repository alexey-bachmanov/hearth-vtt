<script lang="ts">
/**
 * Router component for HearthVTT.
 *
 * Manages client-side routing using the HTML5 History API.
 * Listens to popstate events and reactively renders the correct page.
 *
 * Routes:
 * - /              → SplashPage
 * - /join/:token   → JoinPage
 * - /play          → CampaignPickerPage  (auth-guarded)
 * - /play/login    → PlayLoginPage       (?returnTo)
 * - /play/account  → PlayAccountPage     (auth-guarded)
 * - /play/:id      → PlayLayout          (auth-guarded)
 * - /admin/setup   → AdminSetup
 * - /admin/login   → AdminLogin
 * - /admin         → AdminLayout
 * - *              → NotFoundPage
 *
 * Auth guard: protected routes call authState.loadMe() on mount.
 * On 401 the guard redirects to /play/login?returnTo=<currentPath>.
 */

import { onMount } from 'svelte';
import { parseRoute, navigateWithReturnTo, type Route } from './routes.js';
import { authState } from '../state/auth.svelte.js';
import PlayLayout from '../ui/layout/PlayLayout.svelte';
import AdminLayout from '../ui/layout/AdminLayout.svelte';
import AdminSetup from '../ui/admin/AdminSetup.svelte';
import AdminLogin from '../ui/admin/AdminLogin.svelte';
import AdminRecovery from '../ui/admin/Recovery.svelte';
import JoinPage from '../ui/auth/JoinPage.svelte';
import SplashPage from '../ui/auth/SplashPage.svelte';
import PlayLoginPage from '../ui/auth/PlayLoginPage.svelte';
import PlayAccountPage from '../ui/auth/PlayAccountPage.svelte';
import CampaignPickerPage from '../ui/auth/CampaignPickerPage.svelte';
import NotFoundPage from '../ui/auth/NotFoundPage.svelte';

let currentRoute = $state<Route>(
  parseRoute(window.location.pathname, window.location.search),
);

/**
 * Handle browser back/forward navigation.
 */
function handlePopState() {
  currentRoute = parseRoute(window.location.pathname, window.location.search);
}

/**
 * Auth guard: runs whenever currentRoute changes.
 *
 * If the destination is a protected route and the user is not logged in,
 * redirects to /play/login with a returnTo parameter.
 */
$effect(() => {
  const type = currentRoute.type;
  if (type === 'play' || type === 'play-account' || type === 'play-campaign') {
    authState.loadMe().then((me) => {
      if (!me) {
        navigateWithReturnTo(
          '/play/login',
          window.location.pathname + window.location.search,
        );
      }
    });
  }
});

onMount(() => {
  window.addEventListener('popstate', handlePopState);
  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
});
</script>

{#if currentRoute.type === 'splash'}
  <SplashPage />
{:else if currentRoute.type === 'join'}
  <JoinPage token={currentRoute.token} />
{:else if currentRoute.type === 'play'}
  {#if authState.loading || !authState.me}
    <div class="auth-loading" aria-live="polite" aria-busy="true"></div>
  {:else}
    <CampaignPickerPage />
  {/if}
{:else if currentRoute.type === 'play-login'}
  <PlayLoginPage returnTo={currentRoute.returnTo} />
{:else if currentRoute.type === 'play-account'}
  {#if authState.loading || !authState.me}
    <div class="auth-loading" aria-live="polite" aria-busy="true"></div>
  {:else}
    <PlayAccountPage />
  {/if}
{:else if currentRoute.type === 'play-campaign'}
  {#if authState.loading || !authState.me}
    <div class="auth-loading" aria-live="polite" aria-busy="true"></div>
  {:else}
    <PlayLayout campaignId={currentRoute.campaignId} />
  {/if}
{:else if currentRoute.type === 'admin-setup'}
  <AdminSetup />
{:else if currentRoute.type === 'admin-login'}
  <AdminLogin />
{:else if currentRoute.type === 'admin-recovery'}
  <AdminRecovery />
{:else if currentRoute.type === 'admin'}
  <AdminLayout />
{:else}
  <NotFoundPage />
{/if}

<style>
  .auth-loading {
    /* Blank placeholder while auth check is in-flight.
       Navigation will replace this with the login page. */
    display: none;
  }
</style>

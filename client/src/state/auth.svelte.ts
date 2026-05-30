/**
 * Auth state management using Svelte 5 runes.
 *
 * Holds the current player session (MeResponse) and provides
 * `loadMe()` / `logout()` operations used by the auth guard and
 * account pages.
 *
 * Design notes:
 * - State is module-level (singleton) — import the exported `authState` instance.
 * - `loadMe()` is idempotent when called concurrently; a single in-flight fetch
 *   is shared via the `_loadingPromise` field.
 * - `logout()` calls POST /api/auth/logout then navigates to `/` (splash).
 *
 * @see docs/decisions/010-player-account-model.md
 * @see docs/components/auth-join-flow.md
 */

import { navigate, navigateWithReturnTo } from '../app/routes.js';
import type { MeResponse } from '@hearth-vtt/shared';

class AuthState {
  me = $state<MeResponse | null>(null);
  /**
   * Player CSRF token stored after login/refresh.
   *
   * Injected by HttpClient into X-CSRF-Token on all POST/PATCH/DELETE requests.
   * Cleared on logout or when an unexpected 401 is received.
   */
  csrfToken = $state<string | null>(null);
  loading = $state(false);

  private _loadingPromise: Promise<MeResponse | null> | null = null;

  /**
   * Fetch the current session from GET /api/auth/me.
   *
   * Returns the MeResponse on success, or null on 401 / network error.
   * Concurrent calls share the same in-flight request.
   */
  loadMe(): Promise<MeResponse | null> {
    if (this._loadingPromise) return this._loadingPromise;

    this._loadingPromise = this._doLoadMe().finally(() => {
      this._loadingPromise = null;
    });

    return this._loadingPromise;
  }

  private async _doLoadMe(): Promise<MeResponse | null> {
    this.loading = true;
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
      });

      if (res.status === 401) {
        this.me = null;
        return null;
      }

      if (!res.ok) {
        console.error('[AuthState] GET /api/auth/me returned', res.status);
        this.me = null;
        return null;
      }

      const data = (await res.json()) as MeResponse;
      this.me = data;
      return data;
    } catch (err) {
      console.error('[AuthState] loadMe() network error', err);
      this.me = null;
      return null;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Log out: revoke the server session and clear local state.
   *
   * Navigates to `/` (splash) regardless of whether the server call succeeds,
   * so the user is never left in a broken state.
   */
  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('[AuthState] logout() network error', err);
    } finally {
      this.me = null;
      this.csrfToken = null;
      navigate('/');
    }
  }

  /**
   * Called when an authenticated request unexpectedly receives a 401.
   *
   * Clears session state and redirects to the login page with a returnTo param
   * so the user can resume where they left off.
   */
  handleUnauthenticated(): void {
    this.me = null;
    this.csrfToken = null;
    navigateWithReturnTo(
      '/play/login',
      window.location.pathname + window.location.search,
    );
  }
}

export const authState = new AuthState();

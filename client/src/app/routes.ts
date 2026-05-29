/**
 * Route definitions for HearthVTT SPA.
 *
 * Routes:
 * - /               - Splash page (logo + 3 buttons: Play / Account / Admin)
 * - /join/:token    - Invite claim page (public)
 * - /play           - Campaign picker (requires auth)
 * - /play/login     - Player login (public; accepts ?returnTo=<same-origin-path>)
 * - /play/account   - Account settings placeholder (requires auth)
 * - /play/:id       - Game UI for a specific campaign (requires auth)
 * - /admin          - Admin SPA (requires admin auth)
 * - /admin/setup    - Initial admin setup
 * - /admin/login    - Admin login
 * - fallback        - 404 not-found
 */

export type Route =
  | { type: 'splash' }
  | { type: 'join'; token: string }
  | { type: 'play' }
  | { type: 'play-login'; returnTo: string | null }
  | { type: 'play-account' }
  /**
   * `/play/:campaignId[?seat=<seatId>]`
   *
   * `seatId` is a dev-only bypass: when present the auth guard and WS client
   * skip normal cookie auth and use the given seat ID directly. Must be
   * removed once Phase 5 (real player auth) lands.
   *
   * @see scripts/seed-dev-db.ts
   * @see client/src/app/Router.svelte (auth guard bypass)
   * @see client/src/api/ws.ts (seat param forwarding)
   */
  | { type: 'play-campaign'; campaignId: string; seatId?: string }
  | { type: 'admin' }
  | { type: 'admin-setup' }
  | { type: 'admin-login' }
  | { type: 'not-found' };

/**
 * Validate that a `returnTo` query-string value is a safe same-origin pathname.
 *
 * Accepts only absolute pathnames starting with `/` that contain no scheme,
 * host, or authority component. This prevents open-redirect attacks where a
 * crafted `returnTo` could redirect the user to an external site.
 *
 * @param value - Raw query-string value to validate
 * @returns The pathname if safe, `null` otherwise
 */
export function validateReturnTo(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  // Must start with a single `/` (reject `//`, `///`, protocol-relative, etc.)
  if (!/^\/[^/]/.test(value) && value !== '/') return null;

  // Must not contain `://` (catches `http://`, `javascript:`, etc.)
  if (value.includes('://')) return null;

  // Must not contain `@` (catches `//user@host` variants)
  if (value.includes('@')) return null;

  return value;
}

/**
 * Parse the current URL into a Route object.
 *
 * @param pathname - window.location.pathname
 * @param search   - window.location.search (optional; used for ?returnTo)
 * @returns Parsed Route
 */
export function parseRoute(pathname: string, search: string = ''): Route {
  // Remove trailing slash for consistency, preserve bare `/`
  const path = pathname.replace(/\/$/, '') || '/';

  // Match /
  if (path === '/') {
    return { type: 'splash' };
  }

  // Match /join/:token
  const joinMatch = path.match(/^\/join\/([^/]+)$/);
  if (joinMatch) {
    return { type: 'join', token: joinMatch[1] };
  }

  // Match /play/login (before /play/:id so it takes priority)
  if (path === '/play/login') {
    const params = new URLSearchParams(search);
    const returnTo = validateReturnTo(params.get('returnTo'));
    return { type: 'play-login', returnTo };
  }

  // Match /play/account
  if (path === '/play/account') {
    return { type: 'play-account' };
  }

  // Match /play/:campaignId (non-empty segment, not a reserved word)
  const playCampaignMatch = path.match(/^\/play\/([^/]+)$/);
  if (playCampaignMatch) {
    const params = new URLSearchParams(search);
    // DEV HACK: ?seat= forwarded to bypass auth guard + WS auth.
    // Remove after Phase 5 (real player auth).
    const seatId = params.get('seat') ?? undefined;
    return { type: 'play-campaign', campaignId: playCampaignMatch[1], seatId };
  }

  // Match /play (exact)
  if (path === '/play') {
    return { type: 'play' };
  }

  // Match /admin/setup
  if (path === '/admin/setup') {
    return { type: 'admin-setup' };
  }

  // Match /admin/login
  if (path === '/admin/login') {
    return { type: 'admin-login' };
  }

  // Match /admin (exact)
  if (path === '/admin') {
    return { type: 'admin' };
  }

  // Fallback: 404
  return { type: 'not-found' };
}

/**
 * Navigate to a new route using the HTML5 History API.
 *
 * @param path - Target path (e.g., '/play', '/admin')
 */
export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  // Dispatch popstate to trigger router update
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Navigate to a path and include a validated `returnTo` query parameter.
 *
 * The `returnTo` value is only appended when it passes same-origin validation.
 * Use this when redirecting to `/play/login` from a protected route so the
 * user is sent back to their original destination after login.
 *
 * @param path     - Target path (e.g., '/play/login')
 * @param returnTo - Current path to return to after login
 */
export function navigateWithReturnTo(path: string, returnTo?: string): void {
  const safe = validateReturnTo(returnTo ?? null);
  const target = safe ? `${path}?returnTo=${encodeURIComponent(safe)}` : path;
  navigate(target);
}

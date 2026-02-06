/**
 * Route definitions for HearthVTT SPA.
 *
 * The application has ~4 main routes:
 * - /join/:token - Invite claim page (public)
 * - /play - Main game interface (requires auth)
 * - /admin - Campaign management (requires admin auth)
 * - fallback - Not logged in page
 */

export type Route =
  | { type: 'join'; token: string }
  | { type: 'play' }
  | { type: 'admin' }
  | { type: 'admin-setup' }
  | { type: 'admin-login' }
  | { type: 'not-logged-in' };

/**
 * Parse the current URL path into a Route object.
 *
 * @param pathname - window.location.pathname
 * @returns Parsed route object
 */
export function parseRoute(pathname: string): Route {
  // Remove trailing slash for consistency
  const path = pathname.replace(/\/$/, '') || '/';

  // Match /join/:token
  const joinMatch = path.match(/^\/join\/([^/]+)$/);
  if (joinMatch) {
    return { type: 'join', token: joinMatch[1] };
  }

  // Match /play
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

  // Match /admin
  if (path === '/admin') {
    return { type: 'admin' };
  }

  // Default: not logged in
  return { type: 'not-logged-in' };
}

/**
 * Navigate to a new route using HTML5 History API.
 *
 * @param path - Target path (e.g., '/play', '/admin')
 */
export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  // Dispatch popstate to trigger router update
  window.dispatchEvent(new PopStateEvent('popstate'));
}

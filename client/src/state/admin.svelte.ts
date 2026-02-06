/**
 * Admin authentication state management using Svelte 5 runes.
 *
 * This module holds admin session state including CSRF token.
 * The CSRF token is stored in memory and must be included in all
 * state-changing admin API requests.
 */

/**
 * Admin auth state store.
 *
 * Manages CSRF token and authentication state for admin operations.
 * Not persisted across page reloads (token is retrieved from server on login/setup).
 */
class AdminAuthState {
  csrfToken = $state<string | null>(null);

  /**
   * Set CSRF token from login/setup response.
   */
  setCsrfToken(token: string) {
    this.csrfToken = token;
  }

  /**
   * Clear CSRF token on logout.
   */
  clearCsrfToken() {
    this.csrfToken = null;
  }

  /**
   * Get current CSRF token.
   */
  getCsrfToken(): string | null {
    return this.csrfToken;
  }
}

export const adminAuth = new AdminAuthState();

/**
 * Admin fetch helper that automatically includes CSRF token.
 *
 * Use this for all state-changing admin API requests (POST, PUT, PATCH, DELETE).
 * GET requests don't need CSRF protection and can use regular fetch.
 *
 * @param url - API endpoint URL
 * @param options - Fetch options (will merge in CSRF header)
 * @returns Fetch response
 *
 * @example
 * const response = await adminFetch('/api/admin/logout', { method: 'POST' });
 */
export async function adminFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const csrfToken = adminAuth.getCsrfToken();

  // Add CSRF token to headers if available
  const headers = new Headers(options.headers || {});
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  // Merge headers and credentials
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Always include cookies for admin requests
  };

  return fetch(url, fetchOptions);
}

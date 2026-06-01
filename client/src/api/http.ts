/**
 * HTTP Client for HearthVTT REST API.
 *
 * Provides a typed interface to all HTTP API endpoints defined in
 * docs/protocols/http-api.md.
 *
 * Responsibilities:
 * - Sets Content-Type: application/json for requests
 * - Handles error response format: { error: { code, message } }
 * - Exposes typed methods for each endpoint group
 * - Includes auth credentials (cookies) in all requests
 */

import type {
  MeResponse,
  LoginResponse,
  RefreshResponse,
  ClaimInviteRequest,
  ClaimInviteResponse,
  ChangePasswordRequest,
  AdminAccountSummary,
  AdminResetPasswordRequest,
} from '@hearth-vtt/shared';
import type { SeatRole } from '@hearth-vtt/shared';
import { authState } from '../state/auth.svelte.js';

// ---------------------------------------------------------------------------
// Protocol types (client-visible server response shapes)
// ---------------------------------------------------------------------------

/** Campaign as returned by the server (timestamps are Unix ms numbers). */
export interface AdminCampaign {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** Seat as returned by the server. */
export interface AdminSeat {
  id: string;
  campaignId: string;
  displayName: string;
  role: SeatRole;
  accountId: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Invite as returned by the admin list endpoint (timestamps are ISO strings; pinHash omitted). */
export interface AdminInvite {
  id: string;
  seatId: string;
  inviteToken: string;
  maxUses: number;
  usesRemaining: number;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

/**
 * API error response format from server.
 */
interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Custom error class for API errors.
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * HTTP Client base class.
 *
 * Wraps fetch with JSON handling and error parsing.
 */
class HttpClient {
  private baseUrl: string;

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a GET request.
   */
  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /**
   * Make a POST request.
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * Make a PATCH request.
   */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  /**
   * Make a DELETE request.
   */
  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /**
   * Make an HTTP request with error handling.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    console.log(`[HttpClient] ${method} ${url}`, body);

    // Build headers; inject CSRF token on mutating requests.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const isMutation =
      method === 'POST' || method === 'PATCH' || method === 'DELETE';
    if (isMutation && authState.csrfToken) {
      headers['X-CSRF-Token'] = authState.csrfToken;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include', // Include cookies for auth
      });

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      const data = await response.json();

      // Check for error response
      if (!response.ok) {
        if (response.status === 401 && authState.me !== null) {
          // Unexpected 401: session has been revoked. Clear state + redirect.
          authState.handleUnauthenticated();
        }
        const apiError = data as ApiErrorResponse;
        throw new ApiError(
          apiError.error?.code || 'UNKNOWN_ERROR',
          apiError.error?.message || 'An error occurred',
          response.status,
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error('[HttpClient] Request failed:', error);
      throw new ApiError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Network request failed',
      );
    }
  }
}

/**
 * HTTP client for admin endpoints.
 *
 * Identical to HttpClient but injects the admin CSRF token (from `adminAuth`)
 * rather than the player CSRF token (from `authState`).
 *
 * The CSRF getter is injected via `setCsrfGetter()` rather than imported
 * directly from the admin state module, which avoids a circular dependency
 * between http.ts and admin.svelte.ts.
 */
export class AdminHttpClient {
  private baseUrl: string;
  private csrfGetter: () => string | null = () => null;

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  /** Wire up the admin CSRF token source. Called once from admin.svelte.ts. */
  setCsrfGetter(fn: () => string | null): void {
    this.csrfGetter = fn;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const isMutation =
      method === 'POST' || method === 'PATCH' || method === 'DELETE';
    const csrfToken = this.csrfGetter();
    if (isMutation && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });

      if (response.status === 204) {
        return undefined as T;
      }

      const data = await response.json();

      if (!response.ok) {
        const apiError = data as ApiErrorResponse;
        throw new ApiError(
          apiError.error?.code || 'UNKNOWN_ERROR',
          apiError.error?.message || 'An error occurred',
          response.status,
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Network request failed',
      );
    }
  }
}

/**
 * Authentication API client.
 */
export class AuthApi {
  constructor(private http: HttpClient) {}

  /**
   * Fetch the current authenticated session.
   *
   * @returns MeResponse on success.
   * @throws ApiError with status 401 when not authenticated.
   */
  async me(): Promise<MeResponse> {
    return this.http.get<MeResponse>('/auth/me');
  }

  /**
   * Log in with username and password.
   *
   * On success the server sets the `hearth_refresh` HttpOnly cookie.
   *
   * @param username - Player username.
   * @param password - Player password.
   * @returns MeResponse (same shape as /api/auth/me).
   * @throws ApiError 401 on bad credentials, 429 on rate-limit.
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    return this.http.post<LoginResponse>('/auth/login', { username, password });
  }

  /**
   * Log out and revoke the current session.
   *
   * Clears the `hearth_refresh` cookie server-side.
   */
  async logout(): Promise<void> {
    return this.http.post<void>('/auth/logout');
  }

  /**
   * Refresh access token using the refresh token cookie.
   *
   * The refresh token is NOT rotated (stable refresh per ADR-010).
   *
   * @returns New access token.
   * @throws ApiError 401 when refresh cookie absent or session revoked.
   */
  async refresh(): Promise<RefreshResponse> {
    return this.http.post<RefreshResponse>('/auth/refresh');
  }

  /**
   * Claim an invite and create an authenticated session.
   *
   * @param data - Discriminated union on `mode: 'login' | 'register'`.
   * @returns Campaign / seat info for the newly bound seat.
   * @throws ApiError 400 on invalid/expired invite, 401 on wrong PIN,
   *   409 on username conflict (register mode).
   */
  async claimInvite(data: ClaimInviteRequest): Promise<ClaimInviteResponse> {
    return this.http.post<ClaimInviteResponse>('/auth/claim-invite', data);
  }

  /**
   * Change the current player's password.
   *
   * Requires an active session and CSRF token (injected automatically).
   *
   * @param data - Current and new password.
   * @returns Updated MeResponse with mustChangePassword cleared.
   * @throws ApiError 401 on wrong current password, 403 on CSRF failure.
   */
  async changePassword(data: ChangePasswordRequest): Promise<MeResponse> {
    return this.http.post<MeResponse>('/auth/change-password', data);
  }

  /**
   * Revoke all sessions for the current account ("log out everywhere").
   *
   * Requires an active session and CSRF token (injected automatically).
   * Returns 204 on success; the caller should navigate to login.
   */
  async logoutAll(): Promise<void> {
    return this.http.post<void>('/auth/logout-all');
  }
}

/**
 * Campaign API client.
 */
export class CampaignApi {
  // TODO: Add private http: HttpClient when implementing actual calls

  /**
   * List all campaigns.
   *
   * @returns List of campaigns
   */
  async list(): Promise<{ campaigns: unknown[] }> {
    console.log('[CampaignApi] list() - stub');
    throw new ApiError('NOT_IMPLEMENTED', 'list not yet implemented');
  }

  /**
   * Create a new campaign.
   *
   * @param params - Campaign creation parameters
   * @returns Created campaign with admin seat and invite
   */
  async create(params: {
    name: string;
    rulesetId: string;
    settings?: unknown;
  }): Promise<{
    campaign: unknown;
    adminSeat: unknown;
    adminInvite: unknown;
  }> {
    console.log('[CampaignApi] create() - stub', params);
    throw new ApiError('NOT_IMPLEMENTED', 'create not yet implemented');
  }

  /**
   * Get campaign details.
   *
   * @param campaignId - Campaign ID
   * @returns Campaign details
   */
  async get(campaignId: string): Promise<unknown> {
    console.log('[CampaignApi] get() - stub', campaignId);
    throw new ApiError('NOT_IMPLEMENTED', 'get not yet implemented');
  }

  /**
   * Update campaign metadata.
   *
   * @param campaignId - Campaign ID
   * @param updates - Fields to update
   * @returns Updated campaign
   */
  async update(
    campaignId: string,
    updates: { name?: string; settings?: unknown },
  ): Promise<unknown> {
    console.log('[CampaignApi] update() - stub', campaignId, updates);
    throw new ApiError('NOT_IMPLEMENTED', 'update not yet implemented');
  }

  /**
   * Delete a campaign.
   *
   * @param campaignId - Campaign ID
   */
  async delete(campaignId: string): Promise<void> {
    console.log('[CampaignApi] delete() - stub', campaignId);
    throw new ApiError('NOT_IMPLEMENTED', 'delete not yet implemented');
  }
}

/**
 * Seat API client.
 */
export class SeatApi {
  // TODO: Add private http: HttpClient when implementing actual calls

  /**
   * List seats for a campaign.
   *
   * @param campaignId - Campaign ID
   * @returns List of seats
   */
  async list(campaignId: string): Promise<{ seats: unknown[] }> {
    console.log('[SeatApi] list() - stub', campaignId);
    throw new ApiError('NOT_IMPLEMENTED', 'list not yet implemented');
  }

  /**
   * Create a new seat.
   *
   * @param campaignId - Campaign ID
   * @param params - Seat creation parameters
   * @returns Created seat
   */
  async create(
    campaignId: string,
    params: { name: string; role: string },
  ): Promise<unknown> {
    console.log('[SeatApi] create() - stub', campaignId, params);
    throw new ApiError('NOT_IMPLEMENTED', 'create not yet implemented');
  }

  /**
   * Update seat metadata.
   *
   * @param campaignId - Campaign ID
   * @param seatId - Seat ID
   * @param updates - Fields to update
   * @returns Updated seat
   */
  async update(
    campaignId: string,
    seatId: string,
    updates: { name?: string; role?: string },
  ): Promise<unknown> {
    console.log('[SeatApi] update() - stub', campaignId, seatId, updates);
    throw new ApiError('NOT_IMPLEMENTED', 'update not yet implemented');
  }

  /**
   * Delete a seat.
   *
   * @param campaignId - Campaign ID
   * @param seatId - Seat ID
   */
  async delete(campaignId: string, seatId: string): Promise<void> {
    console.log('[SeatApi] delete() - stub', campaignId, seatId);
    throw new ApiError('NOT_IMPLEMENTED', 'delete not yet implemented');
  }
}

/**
 * Invite API client.
 */
export class InviteApi {
  // TODO: Add private http: HttpClient when implementing actual calls

  /**
   * List invites for a campaign.
   *
   * @param campaignId - Campaign ID
   * @returns List of invites
   */
  async list(campaignId: string): Promise<{ invites: unknown[] }> {
    console.log('[InviteApi] list() - stub', campaignId);
    throw new ApiError('NOT_IMPLEMENTED', 'list not yet implemented');
  }

  /**
   * Create a new invite.
   *
   * @param campaignId - Campaign ID
   * @param params - Invite creation parameters
   * @returns Created invite
   */
  async create(
    campaignId: string,
    params: {
      seatId?: string;
      seatTemplate?: { name: string; role: string };
      rolesGranted: string[];
      pin: string;
      expiresIn: number;
      maxClaims?: number;
    },
  ): Promise<{
    invite: {
      id: string;
      inviteToken: string;
      inviteUrl: string;
      expiresAt: string;
    };
  }> {
    console.log('[InviteApi] create() - stub', campaignId, params);
    throw new ApiError('NOT_IMPLEMENTED', 'create not yet implemented');
  }

  /**
   * Revoke an invite.
   *
   * @param campaignId - Campaign ID
   * @param inviteId - Invite ID
   */
  async revoke(campaignId: string, inviteId: string): Promise<void> {
    console.log('[InviteApi] revoke() - stub', campaignId, inviteId);
    throw new ApiError('NOT_IMPLEMENTED', 'revoke not yet implemented');
  }
}

/**
 * Session API client.
 */
export class SessionApi {
  // TODO: Add private http: HttpClient when implementing actual calls

  /**
   * List active sessions for a campaign.
   *
   * @param campaignId - Campaign ID
   * @returns List of sessions
   */
  async list(campaignId: string): Promise<{ sessions: unknown[] }> {
    console.log('[SessionApi] list() - stub', campaignId);
    throw new ApiError('NOT_IMPLEMENTED', 'list not yet implemented');
  }

  /**
   * Revoke a session.
   *
   * @param sessionId - Session ID
   */
  async revoke(sessionId: string): Promise<void> {
    console.log('[SessionApi] revoke() - stub', sessionId);
    throw new ApiError('NOT_IMPLEMENTED', 'revoke not yet implemented');
  }
}

/**
 * Admin authentication API client.
 *
 * Covers the public (no-auth) admin recovery endpoint and the
 * check-auth/CSRF-hydration flow used on page load.
 */
export class AdminAuthApi {
  constructor(private http: HttpClient) {}

  /**
   * Trigger an admin password reset via the filesystem-flag mechanism.
   *
   * The operator must have created an empty `admin-reset.flag` file in the
   * server's data directory before calling this. The server deletes the flag,
   * revokes all admin sessions, and generates a new setup PIN.
   *
   * @returns The newly generated setup PIN (also written to admin-setup-pin.txt).
   * @throws ApiError 404 when the flag file is absent.
   * @throws ApiError 429 on rate-limit.
   * @throws ApiError 500 when the flag could not be deleted.
   */
  async requestReset(): Promise<{ setupPin: string }> {
    return this.http.post<{ setupPin: string }>('/admin/reset');
  }

  /**
   * Check admin authentication status and re-hydrate the CSRF token.
   *
   * Returns the stored CSRF token when authenticated. Used on page load to
   * restore the admin session after a browser reload without a full login.
   *
   * @returns Authentication status and optional CSRF token.
   */
  async checkAuth(): Promise<{
    authenticated: boolean;
    needsSetup?: boolean;
    csrfToken?: string;
  }> {
    return this.http.get('/admin/check-auth');
  }
}

// ============================================================================
// Admin API clients (use AdminHttpClient for CSRF injection)
// ============================================================================

/**
 * Admin — player accounts management API client.
 */
export class AdminAccountApi {
  constructor(private http: AdminHttpClient) {}

  /**
   * List all player accounts with seat counts and seat IDs.
   */
  async list(): Promise<{ accounts: AdminAccountSummary[] }> {
    return this.http.get('/admin/accounts');
  }

  /**
   * Reset a player account's password to a temporary value.
   *
   * Marks mustChangePassword=true and revokes all active sessions.
   * Returns 204 on success.
   */
  async resetPassword(
    id: string,
    body: AdminResetPasswordRequest,
  ): Promise<void> {
    return this.http.post(`/admin/accounts/${id}/reset-password`, body);
  }

  /**
   * Revoke all active sessions for a player account.
   *
   * Returns 204 on success (idempotent).
   */
  async revokeSessions(id: string): Promise<void> {
    return this.http.post(`/admin/accounts/${id}/revoke-sessions`);
  }

  /**
   * Delete a player account.
   *
   * Currently returns 501 (not yet implemented). Callers should catch
   * ApiError with code NOT_IMPLEMENTED and surface a visible inline error.
   */
  async delete(id: string): Promise<void> {
    return this.http.delete(`/admin/accounts/${id}`);
  }

  /**
   * Disconnect a seat from a player account.
   *
   * Currently returns 501 (not yet implemented). Callers should catch
   * ApiError with code NOT_IMPLEMENTED and surface a visible inline error.
   */
  async disconnectSeat(accountId: string, seatId: string): Promise<void> {
    return this.http.post(`/admin/accounts/${accountId}/disconnect-seat`, {
      seatId,
    });
  }
}

/**
 * Admin — campaign management API client.
 */
export class AdminCampaignApi {
  constructor(private http: AdminHttpClient) {}

  /**
   * List all campaigns (GET is unauthenticated; included here for convenience).
   */
  async list(): Promise<{ campaigns: AdminCampaign[] }> {
    return this.http.get('/campaigns');
  }

  /**
   * Create a new campaign.
   *
   * Requires admin session + CSRF.
   * Returns 201 with the created campaign.
   */
  async create(body: { name: string }): Promise<{ campaign: AdminCampaign }> {
    return this.http.post('/campaigns', body);
  }

  /**
   * Rename a campaign.
   *
   * Requires admin session + CSRF.
   * Returns 200 with the updated campaign.
   */
  async rename(id: string, name: string): Promise<{ campaign: AdminCampaign }> {
    return this.http.patch(`/campaigns/${id}`, { name });
  }

  /**
   * Delete a campaign.
   *
   * Requires admin session + CSRF.
   * Returns 204 on success.
   */
  async delete(id: string): Promise<void> {
    return this.http.delete(`/campaigns/${id}`);
  }
}

/**
 * Admin — seat management API client.
 */
export class AdminSeatApi {
  constructor(private http: AdminHttpClient) {}

  /**
   * List all seats for a campaign.
   *
   * Requires admin session.
   */
  async listForCampaign(campaignId: string): Promise<{ seats: AdminSeat[] }> {
    return this.http.get(`/campaigns/${campaignId}/seats`);
  }

  /**
   * Create a new seat in a campaign.
   *
   * Requires admin session + CSRF.
   * Returns 201 with the created seat.
   */
  async create(
    campaignId: string,
    body: { displayName: string; role: SeatRole },
  ): Promise<AdminSeat> {
    return this.http.post(`/campaigns/${campaignId}/seats`, body);
  }

  /**
   * Update seat metadata.
   *
   * Requires admin session + CSRF.
   * Returns 200 with the updated seat.
   */
  async update(
    campaignId: string,
    seatId: string,
    patch: { displayName?: string; role?: SeatRole; isActive?: boolean },
  ): Promise<AdminSeat> {
    return this.http.patch(`/campaigns/${campaignId}/seats/${seatId}`, patch);
  }

  /**
   * Delete a seat from a campaign.
   *
   * Requires admin session + CSRF.
   * Returns 204 on success.
   */
  async delete(campaignId: string, seatId: string): Promise<void> {
    return this.http.delete(`/campaigns/${campaignId}/seats/${seatId}`);
  }
}

/**
 * Admin — invite management API client.
 */
export class AdminInviteApi {
  constructor(private http: AdminHttpClient) {}

  /**
   * List all invites across all seats in a campaign.
   *
   * Requires admin session.
   */
  async listForCampaign(
    campaignId: string,
  ): Promise<{ invites: AdminInvite[] }> {
    return this.http.get(`/campaigns/${campaignId}/invites`);
  }

  /**
   * Create a new invite for a seat.
   *
   * Requires admin session + CSRF.
   * Returns 201 with invite token and URL.
   */
  async create(
    campaignId: string,
    body: {
      seatId: string;
      pin: string;
      expiresIn: number;
      maxUses?: number;
    },
  ): Promise<{
    invite: {
      id: string;
      inviteToken: string;
      inviteUrl: string;
      expiresAt: string;
    };
  }> {
    return this.http.post(`/campaigns/${campaignId}/invites`, body);
  }

  /**
   * Revoke an invite by its token.
   *
   * Requires admin session + CSRF.
   * Returns 204 on success.
   */
  async revoke(campaignId: string, inviteToken: string): Promise<void> {
    return this.http.delete(`/campaigns/${campaignId}/invites/${inviteToken}`);
  }
}

/**
 * Main API client instance.
 *
 * Exposes typed methods for all API endpoints.
 */
export class Api {
  // Keep this for future use when sub-clients need it
  public http: HttpClient;
  public adminHttp: AdminHttpClient;

  auth: AuthApi;
  adminAuth: AdminAuthApi;
  adminAccounts: AdminAccountApi;
  adminCampaigns: AdminCampaignApi;
  adminSeats: AdminSeatApi;
  adminInvites: AdminInviteApi;
  campaigns: CampaignApi;
  seats: SeatApi;
  invites: InviteApi;
  sessions: SessionApi;

  constructor(baseUrl = '/api') {
    this.http = new HttpClient(baseUrl);
    this.adminHttp = new AdminHttpClient(baseUrl);

    this.auth = new AuthApi(this.http);
    this.adminAuth = new AdminAuthApi(this.http);
    this.adminAccounts = new AdminAccountApi(this.adminHttp);
    this.adminCampaigns = new AdminCampaignApi(this.adminHttp);
    this.adminSeats = new AdminSeatApi(this.adminHttp);
    this.adminInvites = new AdminInviteApi(this.adminHttp);
    this.campaigns = new CampaignApi();
    this.seats = new SeatApi();
    this.invites = new InviteApi();
    this.sessions = new SessionApi();
  }

  /**
   * Wire up the admin CSRF token source.
   *
   * Must be called once during admin state initialization to break the
   * circular dependency between http.ts and admin.svelte.ts.
   *
   * @example
   *   api.setAdminCsrfGetter(() => adminAuth.getCsrfToken());
   */
  setAdminCsrfGetter(fn: () => string | null): void {
    this.adminHttp.setCsrfGetter(fn);
  }
}

/**
 * Singleton API client instance.
 */
export const api = new Api();

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
} from '@hearth-vtt/shared';

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

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
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
 * Main API client instance.
 *
 * Exposes typed methods for all API endpoints.
 */
export class Api {
  // Keep this for future use when sub-clients need it
  public http: HttpClient;

  auth: AuthApi;
  campaigns: CampaignApi;
  seats: SeatApi;
  invites: InviteApi;
  sessions: SessionApi;

  constructor(baseUrl = '/api') {
    this.http = new HttpClient(baseUrl);

    this.auth = new AuthApi(this.http);
    this.campaigns = new CampaignApi();
    this.seats = new SeatApi();
    this.invites = new InviteApi();
    this.sessions = new SessionApi();
  }
}

/**
 * Singleton API client instance.
 */
export const api = new Api();

/**
 * HTTP API request / response schemas and types.
 *
 * Canonical definitions for all HTTP API contracts shared between the server
 * (validation) and client (typed API calls). Zod schemas are used at the
 * server boundary; inferred TypeScript types are used everywhere else.
 *
 * @see docs/protocols/http-api.md
 * @see docs/components/auth-join-flow.md
 * @see docs/decisions/010-player-account-model.md
 */

import { z } from 'zod';
import { seatRoleSchema } from '../seat';

// ============================================================================
// Shared sub-schemas
// ============================================================================

/**
 * A player's seat in a campaign, as returned by auth endpoints.
 *
 * Used in MeResponse to populate the campaign picker.
 */
export const seatSummarySchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  seatId: z.string(),
  role: seatRoleSchema,
});
export type SeatSummary = z.infer<typeof seatSummarySchema>;

// ============================================================================
// GET /api/auth/me
// ============================================================================

/**
 * Response from GET /api/auth/me.
 *
 * Returned when the caller has a valid access token (or a valid refresh cookie
 * that can be silently exchanged). Used by the client auth guard and campaign
 * picker to determine session state and available campaigns.
 *
 * 401 when not authenticated.
 */
export const meResponseSchema = z.object({
  accountId: z.string(),
  username: z.string(),
  seats: z.array(seatSummarySchema),
  mustChangePassword: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// ============================================================================
// POST /api/auth/login
// ============================================================================

export const loginRequestSchema = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(8).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Response from POST /api/auth/login.
 *
 * On success the server also sets the `hearth_refresh` HttpOnly cookie.
 * 401 on invalid credentials. 429 on rate-limit.
 */
export const loginResponseSchema = meResponseSchema;
export type LoginResponse = MeResponse;

// ============================================================================
// POST /api/auth/logout
// ============================================================================

/**
 * POST /api/auth/logout has no request body.
 *
 * Revokes the current session identified by the `hearth_refresh` cookie and
 * clears the cookie. Returns 204 on success.
 */

// ============================================================================
// POST /api/auth/refresh
// ============================================================================

/**
 * POST /api/auth/refresh has no request body.
 *
 * Reads the `hearth_refresh` cookie and mints a new short-lived access token.
 * The refresh token itself is NOT rotated (stable refresh per ADR-010).
 * Returns the new access token in the response body.
 *
 * 401 when the refresh cookie is absent or the session has been revoked.
 */
export const refreshResponseSchema = z.object({
  accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

// ============================================================================
// POST /api/auth/claim-invite
// ============================================================================

const claimInviteBaseSchema = z.object({
  inviteToken: z.string(),
  pin: z.string(),
});

const claimInviteRegisterSchema = claimInviteBaseSchema.extend({
  mode: z.literal('register'),
  username: z.string().min(2).max(32),
  password: z.string().min(8).max(256),
});

const claimInviteLoginSchema = claimInviteBaseSchema.extend({
  mode: z.literal('login'),
  username: z.string().min(2).max(32),
  password: z.string().min(8).max(256),
});

export const claimInviteRequestSchema = z.discriminatedUnion('mode', [
  claimInviteRegisterSchema,
  claimInviteLoginSchema,
]);
export type ClaimInviteRequest = z.infer<typeof claimInviteRequestSchema>;

/**
 * Response from POST /api/auth/claim-invite.
 *
 * On success the server also sets the `hearth_refresh` HttpOnly cookie.
 * 400 on invalid/expired invite token. 401 on wrong PIN. 409 on username
 * conflict (register mode).
 */
export const claimInviteResponseSchema = z.object({
  accountId: z.string(),
  campaignId: z.string(),
  seatId: z.string(),
  role: seatRoleSchema,
});
export type ClaimInviteResponse = z.infer<typeof claimInviteResponseSchema>;

// ============================================================================
// GET /api/admin/accounts
// ============================================================================

/**
 * A player account entry as seen by the server admin.
 */
export const adminAccountSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  seatCount: z.number().int().nonnegative(),
  mustChangePassword: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type AdminAccountSummary = z.infer<typeof adminAccountSummarySchema>;

/**
 * Response from GET /api/admin/accounts.
 */
export const adminAccountsResponseSchema = z.object({
  accounts: z.array(adminAccountSummarySchema),
});
export type AdminAccountsResponse = z.infer<typeof adminAccountsResponseSchema>;

// ============================================================================
// POST /api/admin/accounts/:id/reset-password
// ============================================================================

export const adminResetPasswordRequestSchema = z.object({
  /** Temporary password set by the admin. Player must change it on next login. */
  temporaryPassword: z.string().min(8).max(256),
});
export type AdminResetPasswordRequest = z.infer<
  typeof adminResetPasswordRequestSchema
>;

/**
 * Response from POST /api/admin/accounts/:id/reset-password.
 *
 * Returns 204 on success. Also revokes all of the account's existing sessions.
 */

// ============================================================================
// POST /api/admin/accounts/:id/revoke-sessions
// ============================================================================

/**
 * POST /api/admin/accounts/:id/revoke-sessions has no request body.
 *
 * Revokes all active sessions for the specified player account.
 * Returns 204 on success.
 */

// ============================================================================
// POST /api/auth/change-password
// ============================================================================

/**
 * Request body for POST /api/auth/change-password.
 *
 * Requires CSRF token and a valid player session. Used both for voluntary
 * password changes and for the forced change when mustChangePassword=true.
 */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(256),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

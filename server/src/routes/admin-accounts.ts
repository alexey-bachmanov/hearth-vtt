/**
 * Server admin — player accounts management endpoints.
 *
 * Routes:
 * - GET  /api/admin/accounts                           - List all player accounts
 * - POST /api/admin/accounts/:id/reset-password        - Set a temporary password and revoke all sessions
 * - POST /api/admin/accounts/:id/revoke-sessions       - Revoke all active sessions
 * - DELETE /api/admin/accounts/:id                     - Delete an account (501 stub — not yet implemented)
 * - POST /api/admin/accounts/:id/disconnect-seat       - Disconnect a seat from an account (501 stub — not yet implemented)
 *
 * All routes require admin authentication (hearth_admin_session cookie).
 * Mutating routes additionally require a valid CSRF token (X-CSRF-Token header).
 *
 * @see docs/protocols/http-api.md
 * @see docs/decisions/010-player-account-model.md
 */

import type { FastifyInstance } from 'fastify';
import type { Storage } from '../storage/storage.js';
import { requireAdminAuth, requireCsrfToken } from './admin-auth.js';
import { hashPassword, MAX_PASSWORD_LENGTH } from '../utils/password.js';
import { adminResetPasswordRequestSchema } from '@hearth-vtt/shared';
import type { AdminAccountSummary } from '@hearth-vtt/shared';

export async function adminAccountsRoutes(
  server: FastifyInstance,
  options: { storage: Storage },
): Promise<void> {
  const { storage } = options;

  // ==========================================================================
  // GET /api/admin/accounts
  // ==========================================================================

  /**
   * List all player accounts with seat counts.
   *
   * Returns an array of AdminAccountSummary objects. seatCount is the number
   * of active seats bound to the account across all campaigns.
   *
   * Protected by admin session only (read — no CSRF required).
   */
  server.get(
    '/api/admin/accounts',
    { preHandler: requireAdminAuth(storage) },
    async (_request, reply) => {
      const accounts = await storage.listPlayerAccounts();

      const summaries: AdminAccountSummary[] = await Promise.all(
        accounts.map(async (account) => {
          const [seatIds] = await Promise.all([
            storage.listSeatIdsForAccount(account.id),
          ]);
          return {
            id: account.id,
            username: account.username,
            seatCount: seatIds.length,
            seatIds,
            mustChangePassword: account.mustChangePassword,
            createdAt: new Date(account.createdAt).toISOString(),
            lastLoginAt:
              account.lastLoginAt !== null
                ? new Date(account.lastLoginAt).toISOString()
                : null,
          };
        }),
      );

      return reply.send({ accounts: summaries });
    },
  );

  // ==========================================================================
  // POST /api/admin/accounts/:id/reset-password
  // ==========================================================================

  /**
   * Reset a player account's password to a temporary one.
   *
   * Hashes the provided temporaryPassword, stores it, marks the account as
   * mustChangePassword=true, and revokes all of the account's active sessions.
   *
   * The player will be forced to change their password on next login.
   * Returns 204 on success.
   * Returns 404 if the account does not exist.
   * Returns 400 if the password fails validation.
   */
  server.post(
    '/api/admin/accounts/:id/reset-password',
    { preHandler: [requireAdminAuth(storage), requireCsrfToken(storage)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Validate request body
      const parsed = adminResetPasswordRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return reply.send({
          error: { code: 'INVALID_REQUEST', message: parsed.error.message },
        });
      }

      const { temporaryPassword } = parsed.data;

      // Enforce byte-length limit before hashing
      if (Buffer.byteLength(temporaryPassword, 'utf8') > MAX_PASSWORD_LENGTH) {
        reply.code(400);
        return reply.send({
          error: {
            code: 'PASSWORD_TOO_LONG',
            message: `Password must be at most ${MAX_PASSWORD_LENGTH} bytes`,
          },
        });
      }

      // Check account exists
      const account = await storage.getPlayerAccountById(id);
      if (!account) {
        reply.code(404);
        return reply.send({
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Player account not found',
          },
        });
      }

      const newPasswordHash = await hashPassword(temporaryPassword);

      // Mark mustChangePassword and update hash; revoke all sessions
      await storage.setPlayerAccountMustChangePassword(
        id,
        true,
        newPasswordHash,
      );
      await storage.revokeAllAuthSessionsForAccount(id);

      return reply.code(204).send();
    },
  );

  // ==========================================================================
  // POST /api/admin/accounts/:id/revoke-sessions
  // ==========================================================================

  /**
   * Revoke all active player sessions for an account.
   *
   * Useful for kicking a player out without changing their password.
   * Returns 204 on success (idempotent — safe to call even if no active sessions).
   * Returns 404 if the account does not exist.
   */
  server.post(
    '/api/admin/accounts/:id/revoke-sessions',
    { preHandler: [requireAdminAuth(storage), requireCsrfToken(storage)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Check account exists
      const account = await storage.getPlayerAccountById(id);
      if (!account) {
        reply.code(404);
        return reply.send({
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Player account not found',
          },
        });
      }

      await storage.revokeAllAuthSessionsForAccount(id);

      return reply.code(204).send();
    },
  );

  // ==========================================================================
  // DELETE /api/admin/accounts/:id  (501 stub)
  // ==========================================================================

  /**
   * Delete a player account.
   *
   * TODO (Tech Debt — Phase 5.2 follow-up): Implement full deletion.
   * Intended behavior:
   *   1. Revoke all active auth sessions for the account.
   *   2. Null the account_id column on any seats claimed by this account
   *      (the seats themselves are not deleted — they remain available).
   *   3. Hard-delete the player_accounts row.
   *   Design question: should orphaned seats auto-generate a new invite or
   *   require the admin to send one manually?
   *
   * Returns 501 Not Implemented until fully designed and built.
   */
  server.delete(
    '/api/admin/accounts/:id',
    { preHandler: [requireAdminAuth(storage), requireCsrfToken(storage)] },
    async (_request, reply) => {
      reply.code(501);
      return {
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Account deletion is not yet implemented',
        },
      };
    },
  );

  // ==========================================================================
  // POST /api/admin/accounts/:id/disconnect-seat  (501 stub)
  // ==========================================================================

  /**
   * Disconnect a specific seat from a player account.
   *
   * TODO (Tech Debt — Phase 5.2 follow-up): Implement full disconnect.
   * Intended behavior:
   *   1. Null `account_id` on the target seat row.
   *   2. Revoke any active auth sessions for the account that are scoped
   *      to that seat (if sessions carry a seatId; otherwise revoke all
   *      sessions for the account and force re-login).
   * Body: { seatId: string }
   *
   * Returns 501 Not Implemented until fully designed and built.
   */
  server.post(
    '/api/admin/accounts/:id/disconnect-seat',
    { preHandler: [requireAdminAuth(storage), requireCsrfToken(storage)] },
    async (_request, reply) => {
      reply.code(501);
      return {
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Seat disconnect is not yet implemented',
        },
      };
    },
  );
}

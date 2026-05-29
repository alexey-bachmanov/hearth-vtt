/**
 * Domain helpers for PlayerAccount operations.
 *
 * Encapsulates the business rules for account creation, password
 * verification, and seat binding. Storage is injected as a parameter
 * so this module remains framework-agnostic.
 *
 * Callers (route handlers) are responsible for rate limiting and for
 * wrapping these helpers in HTTP responses.
 *
 * Architecture:
 * - All validation (format, policy) is pure and synchronous.
 * - Async helpers that touch storage accept a `Storage` instance.
 * - No Fastify/WebSocket/Node IO imports.
 *
 * @see docs/decisions/010-player-account-model.md
 */

import type { PlayerAccount, Seat, Storage } from '../../storage/index.js';
import {
  hashPassword,
  verifyPassword as verifyHash,
  MAX_PASSWORD_LENGTH,
} from '../../utils/password.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Username must be 2–32 ASCII alphanumeric or `_`, `.`, `-` characters.
 * Case-sensitive for display; callers that need case-insensitive uniqueness
 * should normalise via `normaliseUsername()` before checking.
 *
 * Per ADR-010.
 */
const USERNAME_RE = /^[A-Za-z0-9_.\\-]{2,32}$/;

const MIN_PASSWORD_LENGTH = 8;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type AccountErrorCode =
  | 'USERNAME_TAKEN'
  | 'USERNAME_INVALID'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'INVALID_CREDENTIALS'
  | 'SEAT_ALREADY_BOUND'
  | 'SEAT_NOT_FOUND';

/**
 * Thrown by domain helpers when a business rule is violated.
 * Route handlers should map `code` to an appropriate HTTP status.
 */
export class AccountError extends Error {
  readonly code: AccountErrorCode;

  constructor(code: AccountErrorCode, message: string) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Pure validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a username string against HearthVTT username policy.
 *
 * @param username - The username to validate.
 * @returns An error message string if invalid, or `null` if valid.
 */
export function validateUsername(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return 'Username must be 2–32 characters: letters, digits, underscore, period, or hyphen.';
  }
  return null;
}

/**
 * Validate a password string against HearthVTT password policy.
 *
 * @param password - The plain-text password to validate.
 * @returns An error message string if invalid, or `null` if valid.
 */
export function validatePassword(password: string): string | null {
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_LENGTH) {
    return `Password must not exceed ${MAX_PASSWORD_LENGTH} bytes.`;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Account creation
// ---------------------------------------------------------------------------

/**
 * Create a new PlayerAccount after validating inputs and checking username
 * uniqueness.
 *
 * @param username - Desired username (validated against policy).
 * @param password - Plain-text password (validated against policy).
 * @param storage - Storage facade used to persist the account.
 * @returns The newly created `PlayerAccount`.
 * @throws `AccountError` with code `USERNAME_INVALID` if username fails validation.
 * @throws `AccountError` with code `PASSWORD_TOO_SHORT` or `PASSWORD_TOO_LONG` if
 *   password fails validation.
 * @throws `AccountError` with code `USERNAME_TAKEN` if username already exists.
 */
export async function createAccount(
  username: string,
  password: string,
  storage: Storage,
): Promise<PlayerAccount> {
  const usernameErr = validateUsername(username);
  if (usernameErr !== null) {
    throw new AccountError('USERNAME_INVALID', usernameErr);
  }

  const passwordErr = validatePassword(password);
  if (passwordErr !== null) {
    const code =
      password.length < MIN_PASSWORD_LENGTH
        ? 'PASSWORD_TOO_SHORT'
        : 'PASSWORD_TOO_LONG';
    throw new AccountError(code, passwordErr);
  }

  const existing = await storage.getPlayerAccountByUsername(username);
  if (existing !== null) {
    throw new AccountError(
      'USERNAME_TAKEN',
      `Username "${username}" is already taken.`,
    );
  }

  const passwordHash = await hashPassword(password);
  return storage.createPlayerAccount({ username, passwordHash });
}

// ---------------------------------------------------------------------------
// Password verification
// ---------------------------------------------------------------------------

/**
 * Verify a plain-text password against the hash stored on a PlayerAccount.
 *
 * Uses `timingSafeEqual` internally (via `utils/password`). Does not throw on
 * wrong password — callers should apply rate limiting before calling this.
 *
 * @param account - The `PlayerAccount` whose stored hash to verify against.
 * @param password - The plain-text password to check.
 * @returns `true` if the password matches, `false` otherwise.
 */
export async function verifyAccountPassword(
  account: PlayerAccount,
  password: string,
): Promise<boolean> {
  return verifyHash(password, account.passwordHash);
}

// ---------------------------------------------------------------------------
// Seat binding
// ---------------------------------------------------------------------------

/**
 * Bind a seat to a PlayerAccount.
 *
 * This is called during the claim-invite flow (both `register` and `login`
 * modes). It is idempotent if the seat is already bound to the same account.
 *
 * @param accountId - The `PlayerAccount.id` to bind the seat to.
 * @param campaignId - The campaign that owns the seat.
 * @param seatId - The seat to bind.
 * @param storage - Storage facade for persistence.
 * @returns The updated `Seat`.
 * @throws `AccountError` with code `SEAT_NOT_FOUND` if the seat does not exist.
 * @throws `AccountError` with code `SEAT_ALREADY_BOUND` if the seat is already
 *   bound to a *different* account.
 */
export async function bindSeat(
  accountId: string,
  campaignId: string,
  seatId: string,
  storage: Storage,
): Promise<Seat> {
  const seat = await storage.getSeat(campaignId, seatId);
  if (!seat) {
    throw new AccountError(
      'SEAT_NOT_FOUND',
      `Seat ${seatId} not found in campaign ${campaignId}.`,
    );
  }

  if (seat.accountId !== null && seat.accountId !== accountId) {
    throw new AccountError(
      'SEAT_ALREADY_BOUND',
      `Seat ${seatId} is already bound to another account.`,
    );
  }

  if (seat.accountId !== accountId) {
    await storage.updateSeat(campaignId, seatId, { accountId });
  }

  return { ...seat, accountId };
}

/**
 * Unbind a seat from its current PlayerAccount (sets `accountId` to `null`).
 *
 * Used when an admin revokes a seat assignment or when a campaign is reset.
 *
 * @param campaignId - The campaign that owns the seat.
 * @param seatId - The seat to unbind.
 * @param storage - Storage facade for persistence.
 * @returns The updated `Seat` with `accountId: null`.
 * @throws `AccountError` with code `SEAT_NOT_FOUND` if the seat does not exist.
 */
export async function unbindSeat(
  campaignId: string,
  seatId: string,
  storage: Storage,
): Promise<Seat> {
  const seat = await storage.getSeat(campaignId, seatId);
  if (!seat) {
    throw new AccountError(
      'SEAT_NOT_FOUND',
      `Seat ${seatId} not found in campaign ${campaignId}.`,
    );
  }

  if (seat.accountId !== null) {
    await storage.updateSeat(campaignId, seatId, { accountId: null });
  }

  return { ...seat, accountId: null };
}

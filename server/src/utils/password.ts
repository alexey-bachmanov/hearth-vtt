/**
 * Shared scrypt-based password hashing utilities.
 *
 * Used by both admin-auth (server admin password) and player account management.
 * Hash format: "<hex-salt>:<hex-derived-key>" (salt is 16 random bytes; key is 64 bytes).
 */

import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

/** Maximum accepted password byte length. Prevents HashDoS via expensive scrypt computation. */
export const MAX_PASSWORD_LENGTH = 1024;

/**
 * Hash a password using scrypt with a random salt.
 *
 * @param password - Plain text password
 * @returns Hash string in format: "<salt>:<derivedKey>" (both hex-encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against a stored hash.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param password - Plain text password to verify
 * @param storedHash - Hash string in format: "<salt>:<derivedKey>"
 * @returns True if password matches
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, hexKey] = storedHash.split(':');
  if (!salt || !hexKey) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(hexKey, 'hex');
  if (derivedKey.length !== storedBuffer.length) return false;
  return timingSafeEqual(derivedKey, storedBuffer);
}

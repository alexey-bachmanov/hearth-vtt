/**
 * Setup PIN generation and management utilities.
 *
 * The setup PIN is used for first-time server admin configuration.
 * It's generated on first server startup and expires after 24 hours.
 */

import { randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import type { Storage } from '../storage/storage.js';

const scryptAsync = promisify(scrypt);

const SETUP_PIN_LENGTH = 8;
const SETUP_PIN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const SETUP_PIN_FILENAME = 'admin-setup-pin.txt';

/**
 * Generate a cryptographically secure alphanumeric setup PIN.
 *
 * @param length - Length of PIN to generate (default: 8)
 * @returns Uppercase alphanumeric PIN (e.g., "A3F9K2X7")
 */
export function generateSetupPin(length: number = SETUP_PIN_LENGTH): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (0, O, I, 1)
  const bytes = randomBytes(length);
  
  let pin = '';
  for (let i = 0; i < length; i++) {
    pin += chars[bytes[i] % chars.length];
  }
  
  return pin;
}

/**
 * Hash a PIN using scrypt with a random salt.
 *
 * @param pin - Plain text PIN
 * @returns Hash string in format: salt:hash
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(pin, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Write setup PIN to a file in the data directory.
 *
 * @param dataDir - Data directory path
 * @param pin - Setup PIN to write
 * @param expiresAt - Timestamp when PIN expires
 */
export async function writeSetupPinFile(
  dataDir: string,
  pin: string,
  expiresAt: number,
): Promise<void> {
  const filePath = path.join(dataDir, SETUP_PIN_FILENAME);
  const expiryDate = new Date(expiresAt).toLocaleString();
  
  const content = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║              HearthVTT Server Admin Setup                     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

Your server admin setup PIN is:

    ${pin}

To complete server setup:

1. Open your web browser
2. Navigate to your server URL (e.g., http://localhost:3000)
3. You will be redirected to the admin setup page
4. Enter this PIN when prompted
5. Optionally set a permanent password

⚠️  IMPORTANT SECURITY NOTES:

• This PIN expires on: ${expiryDate}
• This is a ONE-TIME setup PIN
• After setup, this file will be automatically deleted
• Keep this PIN secure - anyone with it can become server admin
• If the PIN expires, restart the server to generate a new one

`.trim();

  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Delete the setup PIN file from the data directory.
 *
 * @param dataDir - Data directory path
 */
export async function deleteSetupPinFile(dataDir: string): Promise<void> {
  const filePath = path.join(dataDir, SETUP_PIN_FILENAME);
  
  try {
    await fs.unlink(filePath);
  } catch (err: unknown) {
    // Ignore errors if file doesn't exist
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Format a console message for the setup PIN.
 *
 * @param pin - Setup PIN
 * @param host - Server host
 * @param port - Server port
 * @returns Formatted console message
 */
export function formatSetupPinMessage(
  pin: string,
  host: string,
  port: number,
): string {
  const url = host === '0.0.0.0' ? `http://localhost:${port}` : `http://${host}:${port}`;
  
  return `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║         🔐  SERVER ADMIN SETUP REQUIRED  🔐                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

Your server needs initial admin setup.

Setup PIN: ${pin}

Visit: ${url}/admin/setup

⏱  This PIN expires in 24 hours.

📄 The PIN has also been saved to: admin-setup-pin.txt
`;
}

/**
 * Ensure server admin setup is complete.
 * If no admin exists, generates a setup PIN and creates the admin record.
 *
 * @param storage - Storage instance
 * @param dataDir - Data directory path
 * @param host - Server host
 * @param port - Server port
 * @returns True if setup was needed and PIN was generated
 */
export async function ensureServerAdminSetup(
  storage: Storage,
  dataDir: string,
  host: string,
  port: number,
): Promise<boolean> {
  // Check if admin already exists
  const existingAdmin = await storage.getServerAdmin();
  
  if (existingAdmin) {
    // Admin exists - check if setup PIN has expired and needs cleanup
    if (existingAdmin.setupPinExpiresAt) {
      const now = Date.now();
      if (existingAdmin.setupPinExpiresAt < now) {
        // Setup PIN expired but admin never completed setup - clean up file
        await deleteSetupPinFile(dataDir);
      }
    }
    return false;
  }
  
  // No admin exists - generate setup PIN
  const pin = generateSetupPin();
  const pinHash = await hashPin(pin);
  const expiresAt = Date.now() + SETUP_PIN_EXPIRY_MS;
  
  // Create admin record with setup PIN
  await storage.createServerAdmin({
    usernameOrEmail: 'admin', // Default username
    pinHash,
    setupPinExpiresAt: expiresAt,
  });
  
  // Write PIN to file
  await writeSetupPinFile(dataDir, pin, expiresAt);
  
  // Log PIN to console
  console.log(formatSetupPinMessage(pin, host, port));
  
  return true;
}

/**
 * Environment variable loader and validator.
 * Loads .env.local from server directory and validates required variables.
 * Fails loudly if configuration is missing or invalid.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the server directory (where .env.local lives)
const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '../..');
const ENV_LOCAL_PATH = join(SERVER_DIR, '.env.local');

/**
 * Parse .env file into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;

    const key = trimmed.substring(0, equalIndex).trim();
    const value = trimmed.substring(equalIndex + 1).trim();

    // Remove quotes if present
    env[key] = value.replace(/^["']|["']$/g, '');
  }

  return env;
}

/**
 * Load and validate .env.local file.
 * Fails if file doesn't exist or required variables are missing.
 */
export function loadAndValidateEnv(): void {
  // Check if .env.local exists
  if (!existsSync(ENV_LOCAL_PATH)) {
    console.error('ERROR: .env.local file not found');
    console.error(`Expected location: ${ENV_LOCAL_PATH}`);
    console.error(
      'Please create a .env.local file based on .env.local.example',
    );
    process.exit(1);
  }

  // Load .env.local
  let envContent: string;
  try {
    envContent = readFileSync(ENV_LOCAL_PATH, 'utf-8');
  } catch (err) {
    console.error('ERROR: Failed to read .env.local file');
    console.error(err);
    process.exit(1);
  }

  const env = parseEnvFile(envContent);

  // Set environment variables (don't override existing ones from system env)
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  // Validate required variables
  const required = ['PORT', 'HOST', 'DATA_DIR', 'COOKIE_SECRET'];
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('ERROR: Required environment variables are missing:');
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
    console.error('\nPlease configure these variables in .env.local');
    process.exit(1);
  }

  // Validate COOKIE_SECRET length (should be at least 32 characters)
  if (process.env.COOKIE_SECRET!.length < 32) {
    console.error('ERROR: COOKIE_SECRET must be at least 32 characters');
    console.error(
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
    process.exit(1);
  }

  // Validate PORT is a number
  const port = parseInt(process.env.PORT!, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error('ERROR: PORT must be a valid port number (1-65535)');
    process.exit(1);
  }

  console.log('✓ Environment configuration loaded successfully');
}

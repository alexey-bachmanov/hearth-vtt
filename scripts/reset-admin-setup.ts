/**
 * reset-admin-setup.ts — Reset the server admin setup state.
 *
 * Deletes the server_admin row and all admin sessions from the dev database so
 * the next server startup re-runs first-time setup (generates a fresh setup
 * PIN and redirects to /admin/setup).
 *
 * Player accounts, campaigns, seats, and all game data are preserved.
 *
 * Usage (from repo root):
 *   npm run dev:reset-setup
 *
 * Environment:
 *   DATA_DIR — path to the server data directory (default: ./server/data)
 *
 * Hard-gated: throws immediately when NODE_ENV=production.
 */

import Database from 'better-sqlite3';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Production guard ──────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'reset-admin-setup must not run in production (NODE_ENV=production)',
  );
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = resolve(
  process.env.DATA_DIR ?? join(REPO_ROOT, 'server', 'data'),
);
const DB_PATH = join(DATA_DIR, 'db', 'hearth.db');
const SETUP_PIN_FILE = join(DATA_DIR, 'admin-setup-pin.txt');

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  if (!existsSync(DB_PATH)) {
    console.log('No database found — nothing to reset.');
    console.log(
      "Run `npm run seed-dev-db` first to create the dev database.",
    );
    return;
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const { adminCount } = db
    .prepare('SELECT COUNT(*) AS adminCount FROM server_admin')
    .get() as { adminCount: number };

  if (adminCount === 0) {
    db.close();
    console.log('No admin account found — already in setup state.');
    return;
  }

  // Delete admin sessions first (no ON DELETE CASCADE on this FK), then the
  // admin row so the server treats startup as a fresh install and generates a
  // new setup PIN.
  db.exec('DELETE FROM admin_sessions');
  db.exec('DELETE FROM server_admin');
  db.close();

  // Remove the setup-pin file so the server regenerates it on next startup.
  if (existsSync(SETUP_PIN_FILE)) {
    rmSync(SETUP_PIN_FILE);
    console.log('Removed admin-setup-pin.txt');
  }

  console.log('Admin setup state reset.');
  console.log(
    'Restart the server — it will print a new setup PIN and show /admin/setup.',
  );
}

main();

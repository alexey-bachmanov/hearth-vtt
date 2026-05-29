/**
 * seed-dev-db.ts — Idempotent dev database seeder.
 *
 * Creates (or recreates) `campaign-mock-001` with two mock seats and a genesis
 * snapshot in the dev SQLite database, so `npm run dev:all` connects to a
 * fully-populated world out of the box.
 *
 * Usage (from repo root):
 *   npm run seed-dev-db
 *
 * Environment:
 *   DATA_DIR — path to the server data directory (default: ./server/data)
 *
 * The script is idempotent: if the campaign already exists it is deleted and
 * recreated from scratch. All child rows (seats, events, snapshots) are
 * removed via ON DELETE CASCADE (enabled per-connection below).
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '../server/src/storage/index.js';
import { buildDevSeed } from '../server/src/domain/engine/dev-seed.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEV_CAMPAIGN_ID = 'campaign-mock-001';
const DEV_SEAT_GM_ID = 'seat-mock-001';
const DEV_SEAT_PLAYER_ID = 'seat-mock-002';

// ── Paths ─────────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = resolve(
  process.env.DATA_DIR ?? join(REPO_ROOT, 'server', 'data'),
);
const DB_PATH = join(DATA_DIR, 'db', 'hearth.db');

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`DATA_DIR: ${DATA_DIR}`);
  console.log(`DB_PATH:  ${DB_PATH}`);

  // Phase 1: full DB reset — delete the file so we start from a clean schema.
  // A soft-delete (storage.deleteCampaign) is insufficient because SqliteStorage
  // does not enable FK cascades, leaving orphaned child rows.
  mkdirSync(join(DATA_DIR, 'db'), { recursive: true });
  if (existsSync(DB_PATH)) {
    rmSync(DB_PATH);
    console.log('Wiped existing DB');
  }
  {
    const storage = new Storage(DATA_DIR);
    await storage.init();
    storage.close();
  }

  // Phase 2: insert campaign + seats with stable hardcoded IDs.
  {
    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');
    const now = Date.now();

    db.prepare(
      `INSERT INTO campaigns (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(DEV_CAMPAIGN_ID, 'Dev Campaign', now, now);

    db.prepare(
      `INSERT INTO seats
         (id, campaign_id, display_name, role, account_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      DEV_SEAT_GM_ID,
      DEV_CAMPAIGN_ID,
      'Game Master',
      'gm',
      null,
      1,
      now,
      now,
    );

    db.prepare(
      `INSERT INTO seats
         (id, campaign_id, display_name, role, account_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      DEV_SEAT_PLAYER_ID,
      DEV_CAMPAIGN_ID,
      'Player One',
      'player',
      null,
      1,
      now,
      now,
    );

    db.close();
  }

  // Phase 3: write the genesis snapshot so PlaceholderEngine.open() finds
  // scene/token/actor data on first connection.
  {
    const storage = new Storage(DATA_DIR);
    await storage.init();
    await storage.putSnapshot(DEV_CAMPAIGN_ID, 0, buildDevSeed());
    storage.close();
  }

  console.log('');
  console.log('Dev DB seeded:');
  console.log(`  Campaign : ${DEV_CAMPAIGN_ID}`);
  console.log(`  GM seat  : ${DEV_SEAT_GM_ID}`);
  console.log(`  Player   : ${DEV_SEAT_PLAYER_ID}`);
  console.log('');
  console.log('Connect at:');
  console.log(
    `  http://localhost:5173/play/${DEV_CAMPAIGN_ID}?seat=${DEV_SEAT_GM_ID}   (GM)`,
  );
  console.log(
    `  http://localhost:5173/play/${DEV_CAMPAIGN_ID}?seat=${DEV_SEAT_PLAYER_ID}  (Player)`,
  );
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

/**
 * seed-dev-db.ts — Idempotent dev database seeder.
 *
 * Creates `campaign-mock-001` with two mock seats, a genesis snapshot, and a
 * `dev` player account bound to seat-mock-001. After running this script and
 * `npm run dev:all` you can log in at /play/login as `dev` without any manual
 * setup.
 *
 * Usage (from repo root):
 *   npm run seed-dev-db
 *
 * Environment:
 *   DATA_DIR                  — path to the server data directory
 *                               (default: ./server/data)
 *   HEARTH_DEV_ADMIN_PASSWORD — password for the `dev` player account.
 *                               A random password is generated and logged to
 *                               the console if this env var is not set.
 *
 * Idempotency: if the `dev` player account already exists the entire script
 * is skipped (campaign, seats, and snapshot are assumed to be present from
 * the previous run). To re-seed from scratch, delete the database file first:
 *
 *   rm server/data/db/hearth.db && npm run seed-dev-db
 *
 * Hard-gated: throws immediately when NODE_ENV=production.
 */

import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '../server/src/storage/index.js';
import { buildDevSeed } from '../server/src/domain/engine/dev-seed.js';
import { hashPassword } from '../server/src/utils/password.js';

// ── Production guard ──────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'seed-dev-db must not run in production (NODE_ENV=production)',
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEV_CAMPAIGN_ID = 'campaign-mock-001';
const DEV_SEAT_GM_ID = 'seat-mock-001';
const DEV_SEAT_PLAYER_ID = 'seat-mock-002';
const DEV_USERNAME = 'dev';

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

  // Phase 1: idempotency check — skip if the dev account already exists.
  mkdirSync(join(DATA_DIR, 'db'), { recursive: true });
  if (existsSync(DB_PATH)) {
    const checkStorage = new Storage(DATA_DIR);
    await checkStorage.init();
    const existing =
      await checkStorage.getPlayerAccountByUsername(DEV_USERNAME);
    checkStorage.close();
    if (existing) {
      console.log(
        `\nDev account '${DEV_USERNAME}' already exists — skipping seed.\n`,
      );
      console.log('Connect at:');
      console.log(
        `  http://localhost:5173/play/${DEV_CAMPAIGN_ID}   (log in as '${DEV_USERNAME}')`,
      );
      return;
    }
  }

  // Phase 2: full DB reset — delete the file so we start from a clean schema.
  // A soft-delete is insufficient because SqliteStorage does not enable FK
  // cascades globally, leaving orphaned child rows.
  if (existsSync(DB_PATH)) {
    rmSync(DB_PATH);
    console.log('Wiped existing DB');
  }
  {
    const storage = new Storage(DATA_DIR);
    await storage.init();
    storage.close();
  }

  // Phase 3: insert campaign + seats with stable hardcoded IDs.
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

  // Phase 4: genesis snapshot + dev player account.
  {
    const storage = new Storage(DATA_DIR);
    await storage.init();

    await storage.putSnapshot(DEV_CAMPAIGN_ID, 0, buildDevSeed());

    // Resolve password: env var takes precedence; otherwise generate a random
    // one and log it so the developer can copy it.
    const envPassword = process.env.HEARTH_DEV_ADMIN_PASSWORD;
    const password = envPassword ?? randomBytes(16).toString('hex');
    if (!envPassword) {
      console.log('');
      console.log(`Generated dev password: ${password}`);
      console.log(
        '(Set HEARTH_DEV_ADMIN_PASSWORD in your env to use a fixed password)',
      );
    }

    const passwordHash = await hashPassword(password);
    const account = await storage.createPlayerAccount({
      username: DEV_USERNAME,
      passwordHash,
    });

    // Bind the GM seat to the dev account so real auth resolves correctly.
    await storage.updateSeat(DEV_CAMPAIGN_ID, DEV_SEAT_GM_ID, {
      accountId: account.id,
    });

    storage.close();
  }

  console.log('');
  console.log('Dev DB seeded:');
  console.log(`  Campaign : ${DEV_CAMPAIGN_ID}`);
  console.log(
    `  GM seat  : ${DEV_SEAT_GM_ID}  (bound to '${DEV_USERNAME}' account)`,
  );
  console.log(
    `  Player   : ${DEV_SEAT_PLAYER_ID}  (unbound; claim via invite)`,
  );
  console.log('');
  console.log('Connect at:');
  console.log(
    `  http://localhost:5173/play/${DEV_CAMPAIGN_ID}   (log in as '${DEV_USERNAME}')`,
  );
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

/**
 * Dev seed data for the development database.
 *
 * Produces a `SnapshotBlobV1` that bootstraps `campaign-mock-001` with one
 * scene, two tokens, and two actors. Used by `scripts/seed-dev-db.ts`.
 *
 * IDs are stable so the WS dev-bypass constants (`DEV_CAMPAIGN_ID`,
 * `DEV_SEAT_ID`) in `ws.ts` resolve to real rows after seeding.
 *
 * Pure function — no IO.
 */

import type { SnapshotBlobV1 } from './snapshot-blob.js';

// ── Stable dev IDs ────────────────────────────────────────────────────────────

const SCENE_ID = 'scene-dev-001';
const HERO_ACTOR_ID = 'actor-dev-001';
const MONSTER_ACTOR_ID = 'actor-dev-002';
const HERO_TOKEN_ID = 'token-dev-001';
const MONSTER_TOKEN_ID = 'token-dev-002';

/** GM seat ID — matches `DEV_SEAT_ID` in ws.ts. */
const GM_SEAT_ID = 'seat-mock-001';

/** Player seat ID — matches `DEV_SEAT_ID_2` in ws.ts. */
const PLAYER_SEAT_ID = 'seat-mock-002';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a genesis `SnapshotBlobV1` for development.
 *
 * Scene layout:
 *   - One 40×40 grid scene (2000×2000 px, 50 px/cell, 5ft scale)
 *   - Hero token at (100, 100) — player-controlled
 *   - Monster (Goblin) token at (700, 700) — GM-controlled
 *
 * Seat permissions:
 *   - Hero actor: `seat-mock-002` (player) has `'control'`
 *   - Goblin actor: no seat permissions (GM-only via role)
 */
export function buildDevSeed(): SnapshotBlobV1 {
  return {
    schemaVersion: 1,
    activeSceneId: SCENE_ID,
    scenes: {
      [SCENE_ID]: {
        id: SCENE_ID,
        name: 'Dev Dungeon',
        gridType: 'square',
        gridSize: 50,
        gridScale: '5ft',
        width: 2000,
        height: 2000,
        data: {},
      },
    },
    tokens: {
      [HERO_TOKEN_ID]: {
        id: HERO_TOKEN_ID,
        actorId: HERO_ACTOR_ID,
        sceneId: SCENE_ID,
        name: 'Hero',
        imageUrl: '',
        position: { x: 100, y: 100 },
        size: 1,
        data: {},
      },
      [MONSTER_TOKEN_ID]: {
        id: MONSTER_TOKEN_ID,
        actorId: MONSTER_ACTOR_ID,
        sceneId: SCENE_ID,
        name: 'Goblin',
        imageUrl: '',
        position: { x: 700, y: 700 },
        size: 1,
        data: {},
      },
    },
    actors: {
      [HERO_ACTOR_ID]: {
        id: HERO_ACTOR_ID,
        name: 'Hero',
        // Player seat has control; GM has implicit control via role.
        seatPermissions: { [PLAYER_SEAT_ID]: 'control' },
        data: {},
      },
      [MONSTER_ACTOR_ID]: {
        id: MONSTER_ACTOR_ID,
        name: 'Goblin',
        // No seat permissions — only the GM (by role) can control this actor.
        seatPermissions: {},
        data: {},
      },
    },
  };
}

export { GM_SEAT_ID, PLAYER_SEAT_ID };

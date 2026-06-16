/**
 * CampaignManager — lifecycle manager for per-campaign GameEngine instances.
 *
 * Responsibilities:
 * - Lazily opens a `GameEngine` the first time a WebSocket client connects to
 *   a campaign.
 * - Reference-counts active connections per campaign.
 * - Starts an idle timer when the last connection disconnects; closes the
 *   engine if no new connection arrives before the timer fires.
 * - `closeAll()` closes every open engine immediately for graceful server
 *   shutdown.
 *
 * @see docs/todo.md — Engine Boundary Refactor, step 8
 */

// import { PlaceholderEngine as Engine } from './placeholder.js';
import { EngineCore } from './core/engine-core.js';
import type { GameEngine } from './index.js';
import type { Storage } from '../../storage/index.js';

// ── Minimal logger interface ──────────────────────────────────────────────────
//
// Defined locally so domain code has no dependency on Fastify or pino types.
// Compatible with Fastify's built-in logger, pino, and console.

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
}

// ── Internal state per managed campaign ──────────────────────────────────────

interface ManagedEntry {
  engine: GameEngine;
  /** Number of currently open WebSocket connections for this campaign. */
  refCount: number;
  /** Handle returned by `setTimeout`; non-null only while idle countdown runs. */
  idleTimer: ReturnType<typeof setTimeout> | null;
}

// ── CampaignManager ───────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of one `GameEngine` per active campaign.
 *
 * Typical usage pattern from the WebSocket handler:
 *
 * ```ts
 * // On WS connect
 * const engine = await manager.acquire(campaignId);
 *
 * // On WS close
 * manager.release(campaignId);
 * ```
 */
export class CampaignManager {
  private readonly entries = new Map<string, ManagedEntry>();

  /**
   * Concurrent-open guard: if two connections arrive before the first
   * `PlaceholderEngine.open()` resolves, the second waits for the same
   * promise instead of starting a redundant open.
   */
  private readonly opening = new Map<string, Promise<ManagedEntry>>();

  /**
   * @param storage      - Passed through to each `GameEngine` on open.
   * @param log          - Logger compatible with Fastify / pino / console.
   * @param idleTimeoutMs - Milliseconds to wait after last disconnect before
   *                        closing the engine. Defaults to 5 minutes.
   *                        Set to a lower value in tests.
   */
  constructor(
    private readonly storage: Storage,
    private readonly log: Logger,
    readonly idleTimeoutMs: number = 5 * 60 * 1000,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Returns the `GameEngine` for `campaignId`, opening it lazily if needed.
   *
   * Increments the connection reference count. The caller **must** call
   * `release(campaignId)` when the associated WebSocket closes.
   *
   * If an open is already in progress (concurrent connects), this awaits that
   * open rather than starting a second one.
   *
   * @throws If `PlaceholderEngine.open()` rejects (e.g. unknown campaign).
   */
  async acquire(campaignId: string): Promise<GameEngine> {
    let entry = this.entries.get(campaignId);

    if (!entry) {
      // Deduplicate concurrent opens for the same campaign.
      let openingPromise = this.opening.get(campaignId);
      if (!openingPromise) {
        openingPromise = this.openEntry(campaignId);
        this.opening.set(campaignId, openingPromise);
      }
      entry = await openingPromise;
    }

    // A new connection arriving during the idle window cancels the close timer.
    if (entry.idleTimer !== null) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }

    entry.refCount++;
    return entry.engine;
  }

  /**
   * Decrements the connection reference count for `campaignId`.
   *
   * When the count reaches zero, starts the idle timer. If the timer fires
   * before a new connection arrives, the engine is closed and removed.
   *
   * Safe to call multiple times or with an unknown `campaignId` (no-op).
   */
  release(campaignId: string): void {
    const entry = this.entries.get(campaignId);
    if (!entry) return;

    entry.refCount = Math.max(0, entry.refCount - 1);

    if (entry.refCount === 0) {
      entry.idleTimer = setTimeout(() => {
        void this.closeEntry(campaignId);
      }, this.idleTimeoutMs);
    }
  }

  /**
   * Immediately closes every open engine, cancelling all pending idle timers.
   *
   * Intended for graceful server shutdown. Awaits `engine.close()` for all
   * engines in parallel.
   */
  async closeAll(): Promise<void> {
    const closingPromises: Promise<void>[] = [];

    for (const [, entry] of this.entries) {
      if (entry.idleTimer !== null) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = null;
      }
      closingPromises.push(entry.engine.close());
    }

    this.entries.clear();
    await Promise.all(closingPromises);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Opens a new engine for `campaignId` and registers it in `entries`.
   *
   * Always cleans up `opening` in the `finally` block so a failed open
   * does not permanently block future open attempts.
   */
  private async openEntry(campaignId: string): Promise<ManagedEntry> {
    try {
      this.log.info('CampaignManager: opening engine campaign=%s', campaignId);
      const engine = await EngineCore.open(campaignId, this.storage);
      const entry: ManagedEntry = { engine, refCount: 0, idleTimer: null };
      this.entries.set(campaignId, entry);
      return entry;
    } finally {
      this.opening.delete(campaignId);
    }
  }

  /** Closes the engine for `campaignId` and removes it from `entries`. */
  private async closeEntry(campaignId: string): Promise<void> {
    const entry = this.entries.get(campaignId);
    if (!entry) return;

    this.log.info(
      'CampaignManager: idle-closing engine campaign=%s',
      campaignId,
    );
    this.entries.delete(campaignId);
    await entry.engine.close();
  }
}

/**
 * D&D 5.5 SRD ruleset manifest — Phase 6D (throwaway v0.1).
 *
 * Validates the baseline + ruleset composition model end-to-end using
 * `token.move` as the single composed action. Real speed/AoO checks land
 * in v0.2; the resolver here is a deliberate placeholder.
 *
 * The exported `lwwMerger` re-exports `mergeIntents` from intent-processor
 * with the standard last-write-wins policy for same-kind + same-target
 * collisions and concat otherwise.
 */

import type {
  ActionBinding,
  Merger,
  ResolverIntent,
  ResolverResult,
  RulesetManifest,
} from './types.js';
import { mergeIntents } from './intent-processor.js';

// ─── Shared merger ────────────────────────────────────────────────────────────

/**
 * Last-write-wins merger: delegates to `mergeIntents` from intent-processor.
 *
 * For same-kind + same-target collisions (e.g. two `token.move` for the same
 * tokenId), the later entry wins. All other intents are concatenated in order.
 *
 * Exported for reuse by other rulesets that want this standard policy.
 */
export const lwwMerger: Merger = mergeIntents;

// ─── token.move resolver ──────────────────────────────────────────────────────

interface TokenMoveArgs {
  seatId: string;
  seatDisplayName: string;
  tokenId?: unknown;
  position?: unknown;
}

const tokenMoveBinding: ActionBinding = {
  resolver(args: unknown, _helpers): ResolverResult {
    if (!args || typeof args !== 'object') {
      throw new Error('[dnd] token.move requires an object payload');
    }

    const { seatDisplayName, tokenId, position } = args as TokenMoveArgs;

    if (typeof tokenId !== 'string') {
      throw new Error('[dnd] token.move requires { tokenId: string }');
    }
    if (
      !position ||
      typeof position !== 'object' ||
      typeof (position as { x?: unknown }).x !== 'number' ||
      typeof (position as { y?: unknown }).y !== 'number'
    ) {
      throw new Error(
        '[dnd] token.move requires { position: { x: number, y: number } }',
      );
    }

    const x = (position as { x: number }).x;
    const y = (position as { y: number }).y;

    // Placeholder: emit a chat-style log entry.
    // Real D&D movement checks (speed, AoO, difficult terrain) land in v0.2.
    const intents: ResolverIntent[] = [
      {
        kind: 'chat.send',
        text: `Token ${tokenId} moved to (${x}, ${y})`,
        displayName: seatDisplayName,
      },
    ];

    return { intents };
  },
};

// ─── Manifest ─────────────────────────────────────────────────────────────────

export const ruleset: RulesetManifest = {
  id: 'dnd-5.5-srd',
  version: '0.0.1',
  actions: {
    'token.move': tokenMoveBinding,
  },
  mergers: {
    'token.move': lwwMerger,
  },
};

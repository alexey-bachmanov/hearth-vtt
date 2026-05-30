/**
 * Dice evaluation wrapper — server-side, engine-internal.
 *
 * Wraps `@dice-roller/rpg-dice-roller` with a deterministic PRNG seeded via
 * `sha256(seed)` → `pure-rand` Mersenne Twister. Rolls are computed once at
 * dispatch time and stored in the event; the library is never re-invoked on
 * replay.
 *
 * Security / robustness guarantees:
 * - Formula length is capped at 200 chars BEFORE invoking the parser.
 * - All library throws are caught and returned as `{ ok: false }` — no stack
 *   traces or internal error details reach the caller.
 * - The global `NumberGenerator.generator.engine` is restored in a `finally`
 *   block so a failed roll cannot corrupt subsequent rolls.
 *
 * Thread-safety note: Node.js is single-threaded. No `await` exists between
 * installing the seeded engine and completing the `DiceRoll` constructor, so
 * concurrent callers cannot interleave with the engine swap.
 *
 * @see docs/todo.md — Phase A (server dice wrapper)
 */

import { createHash } from 'node:crypto';
import { DiceRoll, NumberGenerator } from '@dice-roller/rpg-dice-roller';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — pure-rand sub-path exports lack explicit `types` conditions;
// the .d.ts lives next to the .js file and is picked up by bundler resolution.
import { mersenne } from 'pure-rand/generator/mersenne';

/** Hard cap on formula length before handing to the parser. */
const MAX_FORMULA_LENGTH = 200;

/**
 * Evaluates a dice formula deterministically using `seed` as the PRNG seed.
 *
 * @param formula - Dice notation string (e.g. `"4d6"`, `"2d8+1d4+5"`).
 *   Must be ≤ 200 characters.
 * @param seed    - Arbitrary string used to derive the PRNG seed via sha256.
 *   Typically the actionId of the dispatching action.
 *
 * @returns
 *   `{ ok: true,  rolls: number[], total: number }` on success.
 *   `{ ok: false, reason: string }` on parse failure or oversize formula.
 *   The `reason` is a stable, user-safe string — never a raw stack trace.
 */
export function evaluate(
  formula: string,
  seed: string,
):
  | { ok: true; rolls: number[]; total: number }
  | { ok: false; reason: string } {
  // ── Guard: cap formula length before touching the parser ─────────────────
  if (formula.length > MAX_FORMULA_LENGTH) {
    return { ok: false, reason: 'invalid dice formula' };
  }

  // ── Derive a 32-bit integer seed from sha256(seed) ───────────────────────
  const seedBuf = createHash('sha256').update(seed).digest();
  // readInt32LE gives the full signed 32-bit range [-2^31, 2^31-1], matching
  // the range that MersenneTwister.next() produces internally.
  const seedInt = seedBuf.readInt32LE(0);

  // ── Install seeded PRNG (synchronous — safe in single-threaded Node.js) ──
  const prevEngine = NumberGenerator.generator.engine as { next(): number };
  NumberGenerator.generator.engine = mersenne(seedInt) as { next(): number };

  try {
    // ── Roll ─────────────────────────────────────────────────────────────────
    // `new DiceRoll` is synchronous and uses the installed engine for all RNG.
    const diceRoll = new DiceRoll(formula);
    const total: number = diceRoll.total;

    // ── Extract individual die values ─────────────────────────────────────
    // DiceRoll.rolls is (string | number | RollResults | ResultGroup)[].
    // Only RollResults objects carry a `.rolls` iterable of RollResult items.
    // Strings (operators) and numbers (modifiers) are skipped.
    const rolls: number[] = [];
    for (const group of diceRoll.rolls) {
      if (
        group !== null &&
        typeof group === 'object' &&
        'rolls' in (group as object)
      ) {
        const innerRolls = (group as { rolls: Iterable<{ value: unknown }> })
          .rolls;
        try {
          for (const die of innerRolls) {
            if (typeof die.value === 'number') {
              rolls.push(die.value);
            }
          }
        } catch {
          // Inner rolls not iterable for this group type — skip safely
        }
      }
    }

    return { ok: true, rolls, total };
  } catch {
    // Catch NotationError, peg$SyntaxError, RequiredArgumentError, etc.
    // Return a stable, user-safe reason with no internal detail.
    return { ok: false, reason: 'invalid dice formula' };
  } finally {
    // Restore the previous engine regardless of success or failure
    NumberGenerator.generator.engine = prevEngine;
  }
}

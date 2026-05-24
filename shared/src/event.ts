/**
 * GameEvent type and schema.
 *
 * Events are the immutable audit log of everything that happens in a campaign.
 * Consumers should treat `data` as opaque at the protocol layer — ruleset
 * definitions supply the concrete shape for each `type`.
 */

import { z } from 'zod';
import { audienceSchema } from './enums';

export const gameEventSchema = z.object({
  /** Unique identifier for this event. */
  id: z.string(),
  /** The campaign this event belongs to. */
  campaignId: z.string(),
  /** Ruleset-defined event type token (e.g. 'actor.damage', 'spell.cast'). */
  type: z.string(),
  /** ISO 8601 timestamp of when the event was created on the server. */
  time: z.string(),
  /** Visibility policy controlling which seats receive this event. */
  audience: audienceSchema,
  /** Ruleset-specific payload. Opaque at the protocol layer. */
  data: z.unknown(),
});

/**
 * A single game event.
 *
 * Use the generic parameter when you have a concrete `data` shape:
 * ```ts
 * const dmgEvent: GameEvent<{ amount: number; type: string }> = { ... };
 * ```
 * The Zod schema (`gameEventSchema`) always types `data` as `unknown` for
 * safe boundary validation; cast after narrowing.
 */
export type GameEvent<TData = unknown> = {
  id: string;
  campaignId: string;
  type: string;
  time: string;
  audience: z.infer<typeof audienceSchema>;
  data: TData;
};

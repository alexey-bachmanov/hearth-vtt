/**
 * SourceRef and EntityRef — cross-cutting reference types used in events,
 * actions, and effect stacks to identify the origin and target of a
 * ruleset interaction.
 */

import { z } from 'zod';

// ── EntityRef ─────────────────────────────────────────────────────────────────

/**
 * A reference to a specific entry in a Tome (compendium pack).
 * Used to identify spells, items, features, and effects by source.
 */
export const entityRefSchema = z.object({
  /** Broad category of the referenced entry. */
  kind: z.enum(['spell', 'item', 'feature', 'effect']),
  /** ID of the Tome containing the entry. */
  tomeId: z.string(),
  /** Ruleset-defined ID of the entry within the Tome. */
  id: z.string(),
});
export type EntityRef = z.infer<typeof entityRefSchema>;

// ── SourceRef ─────────────────────────────────────────────────────────────────

/**
 * Identifies the entity (and optional item/spell) responsible for an action,
 * event, or effect application.
 *
 * All fields are optional — a source can be as specific as a named spell from
 * a particular actor, or as vague as "the environment" (all fields absent).
 */
export const sourceRefSchema = z.object({
  /** Actor originating the action (e.g. the caster). */
  actorId: z.string().optional(),
  /** Token originating the action if relevant (e.g. for positional context). */
  tokenId: z.string().optional(),
  /** The item being used, if the action is item-triggered. */
  itemRef: entityRefSchema.optional(),
  /** The spell being cast, if the action is spell-triggered. */
  spellRef: entityRefSchema.optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

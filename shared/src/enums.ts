/**
 * Canonical enum types and Zod schemas for HearthVTT.
 *
 * Zod enums give us both the runtime schema (for boundary validation) and
 * the TypeScript type in a single declaration.
 */

import { z } from 'zod';

/**
 * Entity types stored and manipulated by the engine.
 */
export const entityTypeSchema = z.enum([
  'actor',
  'token',
  'item',
  'effect',
  'workflow',
  'scene',
]);
export type EntityType = z.infer<typeof entityTypeSchema>;

/**
 * Visibility policy for events, prompts, chat cards, and other
 * audience-gated content.
 *
 * - public:  All seats in the campaign
 * - gm:      Triggering player + all GMs
 * - blind:   GMs only (triggering player cannot see)
 * - private: Triggering player + target player(s) only
 */
export const audienceSchema = z.enum(['public', 'gm', 'blind', 'private']);
export type Audience = z.infer<typeof audienceSchema>;

/**
 * Semantic categorisation of prompts.
 *
 * - ephemeral: Non-blocking notification; auto-dismisses or can be ignored
 * - blocking:  Requires user action before continuing
 * - inline:    Rendered within another UI element
 */
export const promptKindSchema = z.enum(['ephemeral', 'blocking', 'inline']);
export type PromptKind = z.infer<typeof promptKindSchema>;

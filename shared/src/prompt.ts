/**
 * Prompt types and schemas.
 *
 * A Prompt is a structured request for player input. Prompts can carry action
 * buttons (with dispatch payloads) and/or a freeform input schema that
 * determines what the workflow.input message should contain.
 */

import { z } from 'zod';
import { audienceSchema } from './enums';
import { promptKindSchema } from './enums';

// ── Action buttons ────────────────────────────────────────────────────────────

export const promptActionSchema = z.object({
  /** Label shown on the button. */
  label: z.string(),
  /** Ruleset action that is dispatched when the button is pressed. */
  dispatch: z.object({
    actionType: z.string(),
    /** Arbitrary payload forwarded to the ruleset resolver. */
    payload: z.unknown(),
  }),
  /** Visual style hint for the client. Defaults to 'secondary'. */
  style: z.enum(['primary', 'secondary', 'danger']).optional(),
});
export type PromptAction = z.infer<typeof promptActionSchema>;

// ── Prompt ───────────────────────────────────────────────────────────────────

export const promptSchema = z.object({
  /** Unique identifier for this prompt. */
  id: z.string(),
  /** The campaign this prompt belongs to. */
  campaignId: z.string(),
  /** Which seats should see this prompt. */
  audience: audienceSchema,
  /** Categorisation controlling how the client renders and prioritises it. */
  kind: promptKindSchema,
  /** Short heading shown to the player. */
  title: z.string(),
  /** Optional body text (markdown supported). */
  body: z.string().optional(),
  /** ISO 8601 timestamp after which the prompt auto-resolves. */
  expiresAt: z.string().optional(),
  /**
   * If set, this prompt is part of a multi-step workflow.
   * Cancelling the prompt will also cancel the workflow.
   */
  workflowId: z.string().optional(),
  /** Buttons rendered by the client. May be empty if `inputSchema` drives the UX. */
  actions: z.array(promptActionSchema),
  /**
   * JSON Schema fragment describing the free-form input the client should
   * collect and forward in a `workflow.input` message. `null` = no free input.
   */
  inputSchema: z.unknown().optional(),
});
export type Prompt = z.infer<typeof promptSchema>;

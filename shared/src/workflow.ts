/**
 * WorkflowState type and schema.
 *
 * A Workflow is a resumable, multi-step interaction driven by the ruleset
 * resolver. The server holds authoritative state; clients receive snapshots
 * via `workflow.update` messages.
 */

import { z } from 'zod';

export const workflowStateSchema = z.object({
  /** Unique identifier for this workflow instance. */
  id: z.string(),
  /** The campaign this workflow belongs to. */
  campaignId: z.string(),
  /** The seat that initiated (and must resolve) this workflow. */
  ownerSeatId: z.string(),
  /** Ruleset-defined workflow type token (e.g. 'spell.targeting'). */
  kind: z.string(),
  /** Current step label within the workflow (ruleset-defined). */
  step: z.string(),
  /**
   * Accumulated context for the resolver.
   * Opaque at the protocol layer; the ruleset defines the shape per `kind`.
   */
  context: z.record(z.string(), z.unknown()),
  /** ISO 8601 timestamp after which the server will auto-cancel this workflow. */
  expiresAt: z.string().optional(),
});
export type WorkflowState = z.infer<typeof workflowStateSchema>;

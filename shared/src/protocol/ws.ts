/**
 * WebSocket protocol message schemas and types.
 *
 * Canonical definitions for all messages exchanged between server and client
 * over the realtime WebSocket connection. Both directions are discriminated
 * unions on the `type` field.
 *
 * ## Migration status
 *
 * The following message types are **deprecated** and will be removed in the
 * Phase 2.5 cleanup commit once all consumers have migrated to the new
 * event-stream model:
 *
 * - Server → Client: `sync.initial`, `sync.delta`, `event.new`,
 *   `prompt.create`, `prompt.cancel`, `workflow.update`,
 *   `token.move.preview`, `token.move.preview.end`
 * - Client → Server: `action`, `workflow.input`, `token.move.preview`,
 *   `token.move`
 *
 * Use `view`, `event` (server → client) and `dispatch`, `view.request`
 * (client → server) for all new code.
 *
 * @see docs/protocols/realtime-ws.md
 * @see docs/decisions/011-engine-facade-and-dsl-reversal.md
 */

import { z } from 'zod';
import { seatRoleSchema } from '../seat';
import { promptSchema } from '../prompt';
import { workflowStateSchema } from '../workflow';
import { gameEventSchema } from '../event';
import { engineInputSchema } from '../engine';
import type { SeatView } from '../engine';

// ============================================================================
// Wire event envelope
// ============================================================================

/**
 * A redacted event placeholder.
 *
 * Sent to seats whose audience filter excludes the real event so that the
 * per-campaign sequence counter stays gapless from every seat's perspective.
 * The payload is intentionally omitted; only the `seq` is forwarded.
 */
export const redactedEventSchema = z.object({
  kind: z.literal('redacted'),
  seq: z.number().int().nonnegative(),
});
export type RedactedEvent = z.infer<typeof redactedEventSchema>;

/**
 * A full game event on the wire (audience has permission to receive it).
 */
export const fullEventEnvelopeSchema = z.object({
  kind: z.literal('full'),
  event: gameEventSchema,
});
export type FullEventEnvelope = z.infer<typeof fullEventEnvelopeSchema>;

/**
 * Tagged union of the two event variants delivered in a `{ type: 'event' }`
 * WS message. Discriminate on `kind`:
 *
 * ```ts
 * if (msg.event.kind === 'redacted') {
 *   // advance lastSeq, no further action
 * } else {
 *   // msg.event.event is a full GameEvent
 * }
 * ```
 */
export const wireEventSchema = z.discriminatedUnion('kind', [
  fullEventEnvelopeSchema,
  redactedEventSchema,
]);
export type WireEvent = z.infer<typeof wireEventSchema>;

// ============================================================================
// Server → Client message schemas
// ============================================================================

const welcomeSchema = z.object({
  type: z.literal('welcome'),
  protocolVersion: z.string(),
  serverVersion: z.string(),
  seatId: z.string(),
  seatRole: seatRoleSchema,
  campaignId: z.string(),
});

/**
 * Full SeatView delivered on connect, reconnect, or explicit resync.
 *
 * The `view` payload is typed as `SeatView` in TypeScript but validated as
 * `z.unknown()` in Zod — the engine guarantees the shape; full Zod validation
 * of the nested entity tree is impractical at the WS boundary.
 */
const viewMessageSchema = z.object({
  type: z.literal('view'),
  view: z.unknown(),
});

/**
 * A single game event (full or redacted) pushed during normal play.
 *
 * The `event` payload is a {@link WireEvent} discriminated on `kind`.
 */
const eventMessageSchema = z.object({
  type: z.literal('event'),
  event: wireEventSchema,
});

/** @deprecated Use `view` instead. */
const syncInitialSchema = z.object({
  type: z.literal('sync.initial'),
  payload: z.unknown(),
});

/** @deprecated Use `event` instead. */
const syncDeltaSchema = z.object({
  type: z.literal('sync.delta'),
  payload: z.unknown(),
});

/** @deprecated Use `event` instead. */
const eventNewSchema = z.object({
  type: z.literal('event.new'),
  payload: z.unknown(),
});

/** @deprecated Prompts flow as GameEvents in the new model. */
const promptCreateSchema = z.object({
  type: z.literal('prompt.create'),
  payload: promptSchema,
});

/** @deprecated Prompts flow as GameEvents in the new model. */
const promptCancelSchema = z.object({
  type: z.literal('prompt.cancel'),
  payload: z.object({ id: z.string() }),
});

/** @deprecated Workflow state is engine-internal. */
const workflowUpdateSchema = z.object({
  type: z.literal('workflow.update'),
  payload: workflowStateSchema,
});

/** @deprecated Token preview is superseded by optimistic client-side rendering. */
const tokenMovePreviewServerSchema = z.object({
  type: z.literal('token.move.preview'),
  payload: z.unknown(),
});

/** @deprecated Token preview is superseded by optimistic client-side rendering. */
const tokenMovePreviewEndSchema = z.object({
  type: z.literal('token.move.preview.end'),
  payload: z.unknown(),
});

const pongSchema = z.object({
  type: z.literal('pong'),
});

const serverErrorSchema = z.object({
  type: z.literal('error'),
  payload: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/**
 * Discriminated union of all messages the server may send to the client.
 */
export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeSchema,
  viewMessageSchema,
  eventMessageSchema,
  syncInitialSchema,
  syncDeltaSchema,
  eventNewSchema,
  promptCreateSchema,
  promptCancelSchema,
  workflowUpdateSchema,
  tokenMovePreviewServerSchema,
  tokenMovePreviewEndSchema,
  pongSchema,
  serverErrorSchema,
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

/**
 * Properly-typed `view` message from the server.
 *
 * Use this type instead of `Extract<ServerMessage, { type: 'view' }>` to
 * get full `SeatView` typing on the `view` field (Zod uses `unknown` there).
 */
export type ViewMessage = { type: 'view'; view: SeatView };

// ============================================================================
// Client → Server message schemas
// ============================================================================

/**
 * Dispatch an action to the engine.
 *
 * Replaces the deprecated `action` and `token.move` message types.
 */
const dispatchMessageSchema = z.object({
  type: z.literal('dispatch'),
  input: engineInputSchema,
});

/**
 * Request a full SeatView resync.
 *
 * Sent by the client when a sequence gap is detected (i.e. the next received
 * event has `seq > lastSeq + 1`). The server responds with a `view` message.
 */
const viewRequestMessageSchema = z.object({
  type: z.literal('view.request'),
});

const resumeSchema = z.object({
  type: z.literal('resume'),
  lastEventSeq: z.number(),
});

/** @deprecated Use `dispatch` instead. */
const actionSchema = z.object({
  type: z.literal('action'),
  payload: z.unknown(),
});

/** @deprecated Workflow input flows through `dispatch` in the new model. */
const workflowInputSchema = z.object({
  type: z.literal('workflow.input'),
  payload: z.unknown(),
});

/** @deprecated Token preview is superseded by optimistic client-side rendering. */
const tokenMovePreviewClientSchema = z.object({
  type: z.literal('token.move.preview'),
  payload: z.unknown(),
});

/** @deprecated Use `dispatch` with `actionType: 'token.move'` instead. */
const tokenMoveSchema = z.object({
  type: z.literal('token.move'),
  payload: z.unknown(),
});

const pingSchema = z.object({
  type: z.literal('ping'),
});

/**
 * Discriminated union of all messages the client may send to the server.
 */
export const clientMessageSchema = z.discriminatedUnion('type', [
  dispatchMessageSchema,
  viewRequestMessageSchema,
  resumeSchema,
  actionSchema,
  workflowInputSchema,
  tokenMovePreviewClientSchema,
  tokenMoveSchema,
  pingSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

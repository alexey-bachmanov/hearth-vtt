/**
 * WebSocket protocol message schemas and types.
 *
 * Canonical definitions for all messages exchanged between server and client
 * over the realtime WebSocket connection. Both directions are discriminated
 * unions on the `type` field.
 *
 * @see docs/protocols/realtime-ws.md
 * @see docs/decisions/011-engine-facade-and-dsl-reversal.md
 */

import { z } from 'zod';
import { seatRoleSchema } from '../seat';
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
 * Ruleset panel definitions, sent once after welcome and cached by the client.
 */
const panelDefsSchema = z.object({
  type: z.literal('panel.defs'),
  panels: z.array(z.unknown()),
});

/**
 * Discriminated union of all messages the server may send to the client.
 */
export const serverMessageSchema = z.discriminatedUnion('type', [
  panelDefsSchema,
  welcomeSchema,
  viewMessageSchema,
  eventMessageSchema,
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

const pingSchema = z.object({
  type: z.literal('ping'),
});

/**
 * Request panel definitions (for reconnect or ruleset reload).
 */
const panelDefsRequestSchema = z.object({
  type: z.literal('panel.defs.request'),
});

/**
 * Discriminated union of all messages the client may send to the server.
 */
export const clientMessageSchema = z.discriminatedUnion('type', [
  dispatchMessageSchema,
  viewRequestMessageSchema,
  resumeSchema,
  pingSchema,
  panelDefsRequestSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

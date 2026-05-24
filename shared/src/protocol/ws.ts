/**
 * WebSocket protocol message schemas and types.
 *
 * Canonical definitions for all messages exchanged between server and client
 * over the realtime WebSocket connection. Both directions are discriminated
 * unions on the `type` field.
 *
 * @see docs/protocols/realtime-ws.md
 */

import { z } from 'zod';
import { seatRoleSchema } from '../seat';
import { promptSchema } from '../prompt';
import { workflowStateSchema } from '../workflow';

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

const syncInitialSchema = z.object({
  type: z.literal('sync.initial'),
  payload: z.unknown(),
});

const syncDeltaSchema = z.object({
  type: z.literal('sync.delta'),
  payload: z.unknown(),
});

const eventNewSchema = z.object({
  type: z.literal('event.new'),
  payload: z.unknown(),
});

const promptCreateSchema = z.object({
  type: z.literal('prompt.create'),
  payload: promptSchema,
});

const promptCancelSchema = z.object({
  type: z.literal('prompt.cancel'),
  payload: z.object({ id: z.string() }),
});

const workflowUpdateSchema = z.object({
  type: z.literal('workflow.update'),
  payload: workflowStateSchema,
});

const tokenMovePreviewServerSchema = z.object({
  type: z.literal('token.move.preview'),
  payload: z.unknown(),
});

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

// ============================================================================
// Client → Server message schemas
// ============================================================================

const resumeSchema = z.object({
  type: z.literal('resume'),
  lastEventSeq: z.number(),
});

const actionSchema = z.object({
  type: z.literal('action'),
  payload: z.unknown(),
});

const workflowInputSchema = z.object({
  type: z.literal('workflow.input'),
  payload: z.unknown(),
});

const tokenMovePreviewClientSchema = z.object({
  type: z.literal('token.move.preview'),
  payload: z.unknown(),
});

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
  resumeSchema,
  actionSchema,
  workflowInputSchema,
  tokenMovePreviewClientSchema,
  tokenMoveSchema,
  pingSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

/**
 * Intent processor — maps ResolverIntent 1:1 to (state mutation + stored
 * event + wire event).
 *
 * Pure function module, no engine state dependency. Trivially testable.
 *
 * @see plan.md — Phase 2: Create intent-processor.ts
 */

import type { Token, Actor } from '@hearth-vtt/shared';
import type { Event as StorageEvent } from '../../../storage/index.js';
import type { ResolverIntent, Workflow } from './types.js';
import type { CampaignState } from '../types-internal.js';

/**
 * Result of processing a single intent.
 *
 * - `stateMutation`: closure that mutates the engine state in-place.
 * - `storedEvent`: fields for Storage.appendEvent (id/seq/timestamp assigned
 *   by the storage layer).
 * - `wireEventType` / `wireEventData`: fields for reconstructing the GameEvent
 *   that is broadcast to subscribers.
 */
export interface ProcessedIntent {
  stateMutation: () => void;
  storedEvent: Omit<StorageEvent, 'id' | 'seq' | 'timestamp'>;
  wireEventType: string;
  wireEventData: Record<string, unknown>;
}

/**
 * Map a single ResolverIntent to its corresponding state mutation, stored
 * event, and wire event.
 *
 * Each intent kind has a fixed mapping:
 *
 * | Intent kind      | State mutation                          | Stored event type | Wire event type  |
 * |------------------|-----------------------------------------|-------------------|------------------|
 * | `token.move`     | `tokens[id].position = to`              | `token.moved`     | `token.moved`    |
 * | `chat.send`      | none                                    | `chat.message`    | `chat.message`   |
 * | `dice.result`    | none                                    | `dice.rolled`     | `dice.rolled`    |
 * | `workflow.open`  | insert into `workflows` map             | `workflow.opened` | `workflow.opened`|
 */
export function processIntent(
  intent: ResolverIntent,
  state: CampaignState,
  campaignId: string,
): ProcessedIntent {
  switch (intent.kind) {
    case 'token.move': {
      const { tokenId, from, to } = intent;
      return {
        stateMutation: () => {
          const token = state.tokens.get(tokenId);
          if (token) {
            state.tokens.set(tokenId, { ...token, position: to });
          }
        },
        storedEvent: {
          campaignId,
          entityId: tokenId,
          type: 'token.moved',
          data: { tokenId, from, to } as unknown as Record<string, unknown>,
        },
        wireEventType: 'token.moved',
        wireEventData: { tokenId, from, to },
      };
    }

    case 'chat.send': {
      const { text, displayName } = intent;
      return {
        stateMutation: () => {
          /* no state mutation */
        },
        storedEvent: {
          campaignId,
          entityId: null,
          type: 'chat.message',
          data: { text, displayName } as unknown as Record<string, unknown>,
        },
        wireEventType: 'chat.message',
        wireEventData: { text, displayName },
      };
    }

    case 'dice.result': {
      const { formula, rolls, total, displayName } = intent;
      return {
        stateMutation: () => {
          /* no state mutation */
        },
        storedEvent: {
          campaignId,
          entityId: null,
          type: 'dice.rolled',
          data: {
            formula,
            rolls,
            total,
            displayName,
          } as unknown as Record<string, unknown>,
        },
        wireEventType: 'dice.rolled',
        wireEventData: { formula, rolls, total, displayName },
      };
    }

    case 'workflow.open': {
      const { id, continuationActionType, data } = intent;
      const workflow: Workflow = { id, continuationActionType, data };
      return {
        stateMutation: () => {
          state.workflows.set(id, workflow);
        },
        storedEvent: {
          campaignId,
          entityId: null,
          type: 'workflow.opened',
          data: { id, continuationActionType, data },
        },
        wireEventType: 'workflow.opened',
        wireEventData: { id, continuationActionType, data },
      };
    }

    // ── Token/Actor CRUD ──────────────────────────────────────────────────

    case 'token.create': {
      const { tokenId, actorId, sceneId, position, name, imageUrl, hidden } =
        intent;
      const newToken: Token = {
        id: tokenId,
        actorId,
        sceneId,
        position,
        size: 1,
        hidden: hidden ?? false,
        ...(name ? { name } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      };
      return {
        stateMutation: () => {
          state.tokens.set(tokenId, newToken);
        },
        storedEvent: {
          campaignId,
          entityId: tokenId,
          type: 'token.created',
          data: { tokenId, actorId, sceneId, position } as unknown as Record<
            string,
            unknown
          >,
        },
        wireEventType: 'token.created',
        wireEventData: { tokenId, actorId, sceneId, position },
      };
    }

    case 'token.delete': {
      const { tokenId } = intent;
      return {
        stateMutation: () => {
          state.tokens.delete(tokenId);
        },
        storedEvent: {
          campaignId,
          entityId: tokenId,
          type: 'token.deleted',
          data: { tokenId },
        },
        wireEventType: 'token.deleted',
        wireEventData: { tokenId },
      };
    }

    case 'actor.create': {
      const { actorId, name: actorName, data } = intent;
      const newActor: Actor = {
        id: actorId,
        name: actorName,
        type: 'npc',
        seatPermissions: {},
        hp: { current: 1, max: 1 },
        ac: 10,
        conditions: [],
        ...(data ? (data as Partial<Actor>) : {}),
      };
      return {
        stateMutation: () => {
          state.actors.set(actorId, newActor);
        },
        storedEvent: {
          campaignId,
          entityId: actorId,
          type: 'actor.created',
          data: { actorId, name: actorName } as unknown as Record<
            string,
            unknown
          >,
        },
        wireEventType: 'actor.created',
        wireEventData: { actorId, name: actorName },
      };
    }

    case 'actor.delete': {
      const { actorId } = intent;
      return {
        stateMutation: () => {
          state.actors.delete(actorId);
        },
        storedEvent: {
          campaignId,
          entityId: actorId,
          type: 'actor.deleted',
          data: { actorId },
        },
        wireEventType: 'actor.deleted',
        wireEventData: { actorId },
      };
    }

    case 'token.linkToActor': {
      const { tokenId, actorId: newActorId } = intent;
      return {
        stateMutation: () => {
          const token = state.tokens.get(tokenId);
          if (token) {
            state.tokens.set(tokenId, { ...token, actorId: newActorId });
          }
        },
        storedEvent: {
          campaignId,
          entityId: tokenId,
          type: 'token.linked',
          data: { tokenId, actorId: newActorId },
        },
        wireEventType: 'token.linked',
        wireEventData: { tokenId, actorId: newActorId },
      };
    }

    case 'actor.linkSeat': {
      const { actorId, seatId, permission } = intent;
      return {
        stateMutation: () => {
          const actor = state.actors.get(actorId);
          if (actor) {
            state.actors.set(actorId, {
              ...actor,
              seatPermissions: {
                ...actor.seatPermissions,
                [seatId]: permission,
              },
            });
          }
        },
        storedEvent: {
          campaignId,
          entityId: actorId,
          type: 'actor.seatLinked',
          data: { actorId, seatId, permission },
        },
        wireEventType: 'actor.seatLinked',
        wireEventData: { actorId, seatId, permission },
      };
    }
  }
}

/**
 * Default merger: concatenate all intents from all resolver results.
 *
 * For same-kind + same-target collisions (e.g. two `token.move` intents for
 * the same tokenId), last write wins — the later entry in the flattened array
 * takes precedence.
 *
 * Exported for reuse by `lwwMerger` in ruleset-dnd.ts.
 */
export function mergeIntents(results: ResolverIntent[][]): ResolverIntent[] {
  // Flatten all intent arrays into one
  const flat = results.flat();

  // For same-kind + same-target collisions, keep only the last occurrence.
  // We use a Map keyed by `${kind}:${targetId}` where targetId is the
  // tokenId for token.move, or null for non-collidable kinds.
  const seen = new Map<string, number>();
  const merged: ResolverIntent[] = [];

  for (let i = flat.length - 1; i >= 0; i--) {
    const intent = flat[i];
    const key = collisionKey(intent);
    if (key !== null) {
      if (seen.has(key)) continue; // Skip — later entry wins
      seen.set(key, i);
    }
    merged.unshift(intent);
  }

  return merged;
}

function collisionKey(intent: ResolverIntent): string | null {
  switch (intent.kind) {
    case 'token.move':
      return `token.move:${intent.tokenId}`;
    case 'chat.send':
      return null; // Chat sends accumulate, never collide
    case 'dice.result':
      return null; // Dice results accumulate, never collide
    case 'workflow.open':
      return `workflow.open:${intent.id}`;
    case 'token.create':
      return `token.create:${intent.tokenId}`;
    case 'token.delete':
      return `token.delete:${intent.tokenId}`;
    case 'actor.create':
      return `actor.create:${intent.actorId}`;
    case 'actor.delete':
      return `actor.delete:${intent.actorId}`;
    case 'token.linkToActor':
      return `token.linkToActor:${intent.tokenId}`;
    case 'actor.linkSeat':
      return `actor.linkSeat:${intent.actorId}:${intent.seatId}`;
  }
}

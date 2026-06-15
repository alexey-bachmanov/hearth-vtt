/**
 * Intent processor — maps ResolverIntent 1:1 to (state mutation + stored
 * event + wire event).
 *
 * Pure function module, no engine state dependency. Trivially testable.
 *
 * @see plan.md — Phase 2: Create intent-processor.ts
 */

import type { Token, Actor, Scene } from '@hearth-vtt/shared';
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
  /** IDs of actors whose data was modified by this intent (for derived field hook). */
  touchedActorIds?: string[];
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
      const {
        tokenId,
        actorId,
        sceneId,
        position,
        name,
        imageUrl,
        hidden,
        data,
      } = intent;
      const newToken: Token = {
        id: tokenId,
        actorId,
        sceneId,
        name: name ?? '',
        imageUrl: imageUrl ?? '',
        position,
        size: 1,
        hidden: hidden ?? false,
        data,
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
      const { actorId, name: actorName, data, seatPermissions } = intent;
      const newActor: Actor = {
        id: actorId,
        name: actorName,
        seatPermissions: seatPermissions ?? {},
        data,
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

    // ── Scene CRUD ────────────────────────────────────────────────────────

    case 'scene.create': {
      const { sceneId, name, data } = intent;
      const newScene: Scene = {
        id: sceneId,
        name,
        gridType: 'square',
        gridSize: 50,
        gridScale: '5ft',
        width: 1000,
        height: 1000,
        data,
      };
      return {
        stateMutation: () => {
          state.scenes.set(sceneId, newScene);
        },
        storedEvent: {
          campaignId,
          entityId: sceneId,
          type: 'scene.created',
          data: {
            sceneId,
            name,
            gridType: newScene.gridType,
            gridSize: newScene.gridSize,
            gridScale: newScene.gridScale,
            width: newScene.width,
            height: newScene.height,
          } as unknown as Record<string, unknown>,
        },
        wireEventType: 'scene.created',
        wireEventData: {
          sceneId,
          name,
          gridType: newScene.gridType,
          gridSize: newScene.gridSize,
          gridScale: newScene.gridScale,
          width: newScene.width,
          height: newScene.height,
        },
      };
    }

    case 'scene.delete': {
      const { sceneId } = intent;
      return {
        stateMutation: () => {
          state.scenes.delete(sceneId);
          // Clear active scene reference if it was the active one
          if (state.activeSceneId === sceneId) {
            state.activeSceneId = null;
          }
        },
        storedEvent: {
          campaignId,
          entityId: sceneId,
          type: 'scene.deleted',
          data: { sceneId },
        },
        wireEventType: 'scene.deleted',
        wireEventData: { sceneId },
      };
    }

    case 'scene.setActive': {
      const { sceneId } = intent;
      return {
        stateMutation: () => {
          state.activeSceneId = sceneId;
        },
        storedEvent: {
          campaignId,
          entityId: sceneId,
          type: 'scene.activated',
          data: { sceneId },
        },
        wireEventType: 'scene.activated',
        wireEventData: { sceneId },
      };
    }

    // ── Replace data (v0.2) ──────────────────────────────────────────────

    case 'actor.replaceData': {
      const { actorId, data } = intent;
      return {
        stateMutation: () => {
          const actor = state.actors.get(actorId);
          if (actor) {
            state.actors.set(actorId, { ...actor, data });
          }
        },
        storedEvent: {
          campaignId,
          entityId: actorId,
          type: 'actor.dataReplaced',
          data: { actorId, data },
        },
        wireEventType: 'actor.dataReplaced',
        wireEventData: { actorId, data },
        touchedActorIds: [actorId],
      };
    }

    case 'token.replaceData': {
      const { tokenId, data } = intent;
      return {
        stateMutation: () => {
          const token = state.tokens.get(tokenId);
          if (token) {
            state.tokens.set(tokenId, { ...token, data });
          }
        },
        storedEvent: {
          campaignId,
          entityId: tokenId,
          type: 'token.dataReplaced',
          data: { tokenId, data },
        },
        wireEventType: 'token.dataReplaced',
        wireEventData: { tokenId, data },
      };
    }

    case 'scene.replaceData': {
      const { sceneId, data } = intent;
      return {
        stateMutation: () => {
          const scene = state.scenes.get(sceneId);
          if (scene) {
            state.scenes.set(sceneId, { ...scene, data });
          }
        },
        storedEvent: {
          campaignId,
          entityId: sceneId,
          type: 'scene.dataReplaced',
          data: { sceneId, data },
        },
        wireEventType: 'scene.dataReplaced',
        wireEventData: { sceneId, data },
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
    case 'scene.create':
      return `scene.create:${intent.sceneId}`;
    case 'scene.delete':
      return `scene.delete:${intent.sceneId}`;
    case 'scene.setActive':
      return `scene.setActive`;
    case 'actor.replaceData':
      return `actor.replaceData:${intent.actorId}`;
    case 'token.replaceData':
      return `token.replaceData:${intent.tokenId}`;
    case 'scene.replaceData':
      return `scene.replaceData:${intent.sceneId}`;
  }
}

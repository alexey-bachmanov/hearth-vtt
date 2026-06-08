/**
 * Dev-mode browser console API for testing engine actions without UI.
 *
 * Exposes `window.__hearth` with four capabilities:
 * - dispatch(actionType, payload) — send an engine action via WebSocket
 * - list(entityType)              — console.table campaign entities
 * - sync()                        — request a full SeatView from the server
 * - state                         — direct reference to campaignState containers
 *
 * Only loaded when `import.meta.env.DEV` is true. Tree-shaken in production.
 *
 * Workflow for testing CRUD actions (no client-side event handlers yet):
 *   __hearth.dispatch('token.create', { tokenId: 'x', actorId: 'y', ... })
 *   __hearth.sync()
 *   __hearth.list('tokens')
 */

import { wsClient } from '../api/ws';
import { campaignState } from '../state/campaign.svelte';

/** Valid entity types for the {@link HearthDevtools.list} method. */
type EntityType = 'actors' | 'tokens' | 'scenes' | 'effects';

interface HearthDevtools {
  /** Dispatch an engine action. */
  dispatch(actionType: string, payload: unknown): void;
  /** Log a console.table of all entities of the given type. */
  list(entityType: EntityType): void;
  /** Request a full SeatView from the server. */
  sync(): void;
  /** Direct references to campaign state containers. */
  readonly state: {
    actors: typeof campaignState.actors;
    tokens: typeof campaignState.tokens;
    scenes: typeof campaignState.scenes;
    effects: typeof campaignState.effects;
    events: typeof campaignState.events;
  };
}

const hearth: HearthDevtools = {
  dispatch(actionType, payload) {
    wsClient.dispatch(actionType, payload);
    console.log(`[Hearth] Dispatched ${actionType}`, payload);
  },

  list(entityType) {
    const validTypes: EntityType[] = ['actors', 'tokens', 'scenes', 'effects'];
    if (!validTypes.includes(entityType)) {
      console.warn(
        `[Hearth] Unknown entity type: "${entityType}". Valid: ${validTypes.join(', ')}`,
      );
      return;
    }

    let entities: unknown[];
    switch (entityType) {
      case 'actors':
        entities = Array.from(campaignState.actors.values());
        break;
      case 'tokens':
        entities = Array.from(campaignState.tokens.values());
        break;
      case 'scenes':
        entities = Array.from(campaignState.scenes.values());
        break;
      case 'effects':
        entities = Array.from(campaignState.effects.values());
        break;
    }

    console.table(entities);
    console.log(`[Hearth] ${entities.length} ${entityType} found`);
  },

  sync() {
    wsClient.send({ type: 'view.request' });
    console.log(
      '[Hearth] View sync requested — full SeatView will arrive shortly',
    );
  },

  get state() {
    return {
      actors: campaignState.actors,
      tokens: campaignState.tokens,
      scenes: campaignState.scenes,
      effects: campaignState.effects,
      events: campaignState.events,
    };
  },
};

(window as unknown as Record<string, unknown>).__hearth = hearth;

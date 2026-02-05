/**
 * Campaign state management using Svelte 5 runes.
 * 
 * This module holds the current campaign state including entities, tokens,
 * and scenes. Updated by server deltas via the WebSocket connection.
 * 
 * State structure mirrors the CampaignState type from server.
 */

/**
 * Campaign state store.
 * 
 * Contains the current snapshot of campaign data received from the server.
 * Updated by sync.delta messages from the WebSocket.
 */
class CampaignState {
  campaignId = $state<string | null>(null);
  entities = $state<Map<string, unknown>>(new Map());
  tokens = $state<Map<string, unknown>>(new Map());
  scenes = $state<Map<string, unknown>>(new Map());
  
  /**
   * Set the entire campaign state (e.g., on initial sync).
   */
  setInitialState(data: { campaignId: string; entities?: unknown[]; tokens?: unknown[]; scenes?: unknown[] }) {
    this.campaignId = data.campaignId;
    // TODO: Populate entities, tokens, scenes from data arrays
    console.log('[CampaignState] Initial state set', data);
  }

  /**
   * Apply a delta patch from the server.
   */
  applyDelta(delta: unknown) {
    // TODO: Implement delta application logic
    console.log('[CampaignState] Delta applied (stub)', delta);
  }

  /**
   * Clear all campaign state (e.g., on logout).
   */
  clear() {
    this.campaignId = null;
    this.entities.clear();
    this.tokens.clear();
    this.scenes.clear();
  }
}

/**
 * Singleton campaign state instance.
 */
export const campaignState = new CampaignState();

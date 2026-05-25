/**
 * Seat permissions derived state.
 *
 * Centralises what the current seat is allowed to see and do based on:
 *   - connectionState.seatRole  — campaign role ('gm' | 'player' | 'spectator' | null)
 *   - connectionState.seatId    — this seat's unique identifier
 *   - campaignState.actors      — per-actor seatPermissions maps
 *
 * GM-role seats have implicit full access to all actors; they are not
 * required to appear in any actor's seatPermissions map.
 *
 * Components and controllers that need per-entity checks (e.g. drag gates,
 * radial menu) should import `seatPermissions` directly rather than using
 * the coarse boolean flags on `uiState`.
 */

import type { Actor } from '@hearth-vtt/shared';
import { campaignState } from './campaign.svelte';
import { connectionState } from './connection.svelte';

class SeatPermissions {
  // ============================================================================
  // Role-level gates
  // ============================================================================

  /**
   * True when the current seat holds the GM role and should see GM-only tooling.
   */
  get canSeeGMTools(): boolean {
    return connectionState.seatRole === 'gm';
  }

  // ============================================================================
  // Per-entity gates
  // ============================================================================

  /**
   * True when the current seat is allowed to drag the given token.
   *
   * - GM: always permitted.
   * - Player: permitted only when the token's actor grants 'control' to this seat.
   * - Spectator / unauthenticated: never permitted.
   */
  canDragToken(tokenId: string): boolean {
    if (connectionState.seatRole === 'gm') return true;
    const token = campaignState.getToken(tokenId);
    if (!token) return false;
    return this.hasActorControl(token.actorId);
  }

  /**
   * True when the current seat has 'control' over the given actor.
   *
   * This is the core permission primitive for entity-level gates:
   *   - drag a token on the canvas
   *   - open the radial action menu
   *   - (future) edit the character sheet
   *
   * - GM: always permitted.
   * - Player: permitted only when the actor's seatPermissions map grants 'control' to this seat.
   * - Spectator / unauthenticated: never permitted.
   */
  hasActorControl(actorId: string): boolean {
    if (connectionState.seatRole === 'gm') return true;
    const seatId = connectionState.seatId;
    if (!seatId) return false;
    const actor = campaignState.getActor(actorId);
    if (!actor) return false;
    return actor.seatPermissions[seatId] === 'control';
  }

  // ============================================================================
  // Derived collections
  // ============================================================================

  /**
   * Actors that should appear as pills in the canvas overlay.
   *
   * - GM: all PC actors in the campaign.
   * - Player: actors where this seat has any permission (control or read).
   * - Spectator / unauthenticated: none.
   */
  get visibleActorPills(): Actor[] {
    const role = connectionState.seatRole;
    if (role === 'gm') return campaignState.getPartyActors();
    const seatId = connectionState.seatId;
    if (!seatId) return [];
    return Array.from(campaignState.actors.values()).filter(
      (a) => seatId in a.seatPermissions,
    );
  }
}

/**
 * Singleton seat permissions instance.
 */
export const seatPermissions = new SeatPermissions();

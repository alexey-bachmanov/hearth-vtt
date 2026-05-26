/**
 * Token selection state management using Svelte 5 runes.
 *
 * Tracks which tokens are currently selected (for multi-select operations) and
 * which token the pointer is hovering over (for visual feedback).
 *
 * Selection is purely client-side (Phase 2); server-side sync and action
 * dispatch are deferred to Phase 3.
 */

import { SvelteSet } from 'svelte/reactivity';

// Type alias for clarity (TokenId is just a string).
type TokenId = string;

export class SelectionState {
  // Set of currently selected token IDs.
  selectedTokenIds = new SvelteSet<TokenId>();

  // The token ID currently under the pointer, or null.
  hoveredTokenId = $state<TokenId | null>(null);

  /**
   * Single-select: replace the selection with just this token.
   */
  select(tokenId: TokenId): void {
    this.selectedTokenIds.clear();
    this.selectedTokenIds.add(tokenId);
  }

  /**
   * Add a token to the selection (multi-select).
   * No-op if already selected.
   */
  addToSelection(tokenId: TokenId): void {
    this.selectedTokenIds.add(tokenId);
  }

  /**
   * Remove a token from the selection.
   * No-op if not currently selected.
   */
  removeFromSelection(tokenId: TokenId): void {
    this.selectedTokenIds.delete(tokenId);
  }

  /**
   * Toggle: if the token is selected, remove it; otherwise add it.
   */
  toggle(tokenId: TokenId): void {
    if (this.selectedTokenIds.has(tokenId)) {
      this.removeFromSelection(tokenId);
    } else {
      this.addToSelection(tokenId);
    }
  }

  /**
   * Clear all selections.
   */
  clear(): void {
    this.selectedTokenIds.clear();
  }

  /**
   * Set the hovered token (null to clear).
   * Used by the input controller to sync hover state from pointermove.
   */
  setHover(tokenId: TokenId | null): void {
    this.hoveredTokenId = tokenId;
  }

  /**
   * Check if a token is selected.
   */
  isSelected(tokenId: TokenId): boolean {
    return this.selectedTokenIds.has(tokenId);
  }

  /**
   * Get the count of selected tokens.
   */
  selectionCount(): number {
    return this.selectedTokenIds.size;
  }
}

/**
 * Global singleton instance of SelectionState.
 * Imported by MainCanvas.svelte, CanvasInputController, and TokenLayer.
 */
export const selectionState = new SelectionState();

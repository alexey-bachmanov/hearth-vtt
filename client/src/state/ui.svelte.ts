/**
 * UI state management using Svelte 5 runes.
 *
 * This module holds the reactive state for the player UI,
 * including drawer/sidebar visibility, active tool drawers,
 * tabbed floating windows, and seat permissions.
 */

import { connectionState } from './connection.svelte';
import type { SeatRole } from './types';

/**
 * Tool drawer IDs for the left toolbar.
 */
export type ToolDrawerId =
  | 'dice'
  | 'annotation'
  | 'measurement'
  | 'initiative'
  | 'jukebox'
  | 'journal'
  | 'compendium'
  | 'settings'
  | 'lighting'
  | 'obstruction'
  | 'scene'
  | 'campaign-prep'
  | 'token-library'
  | 'game-settings';

/**
 * Window IDs for floating windows.
 */
export type WindowId =
  | 'actor-sheet'
  | 'token-config'
  | 'scene-config'
  | 'campaign-prep'
  | 'settings';

/**
 * Window metadata for tracking position, size, z-index, etc.
 */
export interface WindowMeta {
  id: string; // unique ID (e.g., "actor-sheet-123")
  type: WindowId; // window type
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  groupId?: string; // optional tab group ID
}

/**
 * Window tab group for tabbed window containers.
 */
export interface WindowGroup {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  activeTabIndex: number;
  tabs: string[]; // array of window IDs in this group
}

/**
 * UIState holds the reactive state for the player UI.
 *
 * Includes drawer/sidebar visibility, active tool drawers, tabbed windows, and derived seat permissions.
 * Each state field is wrapped in $state() to make it reactively tracked by Svelte 5.
 */
class UIState {
  // Left toolbar drawer (null = none open)
  activeToolDrawer = $state<ToolDrawerId | null>(null);

  // Right sidebar visibility
  rightSidebarCollapsed = $state<boolean>(false);

  // Open windows (mapped by unique window ID)
  openWindows = $state<Map<string, WindowMeta>>(new Map());

  // Window tab groups (mapped by group ID)
  windowGroups = $state<Map<string, WindowGroup>>(new Map());

  // Seat role (derived from connection state)
  // TODO: Retrieve actual seat role from server
  get seatRole(): SeatRole {
    return connectionState.seatId ? 'player' : null;
  }

  // Permission flags (derived from seat role)
  get canAccessGMTools(): boolean {
    return this.seatRole === 'gm';
  }

  get canDragTokens(): boolean {
    return this.seatRole === 'gm' || this.seatRole === 'player';
  }

  get canUseRadialMenu(): boolean {
    return this.seatRole === 'gm' || this.seatRole === 'player';
  }

  get canSeeActorPills(): boolean {
    return this.seatRole === 'gm' || this.seatRole === 'player';
  }

  // ============================================================================
  // Drawer Methods
  // ============================================================================

  /**
   * Toggle a tool drawer (close if already open, open if closed).
   */
  toggleToolDrawer(drawerId: ToolDrawerId) {
    if (this.activeToolDrawer === drawerId) {
      this.activeToolDrawer = null;
    } else {
      this.activeToolDrawer = drawerId;
    }
  }

  /**
   * Close the active tool drawer.
   */
  closeToolDrawer() {
    this.activeToolDrawer = null;
  }

  // ============================================================================
  // Sidebar Methods
  // ============================================================================

  toggleRightSidebar() {
    this.rightSidebarCollapsed = !this.rightSidebarCollapsed;
  }

  // ============================================================================
  // Window Management Methods
  // ============================================================================

  /**
   * Open a new floating window (standalone, not in a group).
   */
  openWindow(windowMeta: WindowMeta) {
    this.openWindows.set(windowMeta.id, windowMeta);
  }

  /**
   * Close a floating window and remove from any tab group.
   */
  closeWindow(windowId: string) {
    const windowMeta = this.openWindows.get(windowId);
    if (windowMeta?.groupId) {
      this.removeWindowFromGroup(windowId, windowMeta.groupId);
    }
    this.openWindows.delete(windowId);
  }

  /**
   * Bring a window (or its group) to the front.
   */
  bringWindowToFront(windowId: string) {
    const windowMeta = this.openWindows.get(windowId);
    if (!windowMeta) return;

    const maxZ = Math.max(
      ...Array.from(this.openWindows.values()).map((w) => w.zIndex),
      ...Array.from(this.windowGroups.values()).map((g) => g.zIndex),
      0,
    );

    if (windowMeta.groupId) {
      // Bring entire group to front
      const group = this.windowGroups.get(windowMeta.groupId);
      if (group) {
        group.zIndex = maxZ + 1;
      }
    } else {
      // Bring standalone window to front
      windowMeta.zIndex = maxZ + 1;
    }
  }

  // ============================================================================
  // Window Tab Group Methods
  // ============================================================================

  /**
   * Create a new window tab group with one or more windows.
   */
  createWindowGroup(
    windowIds: string[],
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const groupId = `group-${Date.now()}`;
    const maxZ = Math.max(
      ...Array.from(this.openWindows.values()).map((w) => w.zIndex),
      ...Array.from(this.windowGroups.values()).map((g) => g.zIndex),
      0,
    );

    this.windowGroups.set(groupId, {
      id: groupId,
      x,
      y,
      width,
      height,
      zIndex: maxZ + 1,
      activeTabIndex: 0,
      tabs: windowIds,
    });

    // Update all windows to reference this group
    for (const windowId of windowIds) {
      const windowMeta = this.openWindows.get(windowId);
      if (windowMeta) {
        windowMeta.groupId = groupId;
      }
    }

    return groupId;
  }

  /**
   * Add a window to an existing tab group.
   */
  addWindowToGroup(windowId: string, groupId: string) {
    const group = this.windowGroups.get(groupId);
    const windowMeta = this.openWindows.get(windowId);
    if (!group || !windowMeta) return;

    // Remove from old group if present
    if (windowMeta.groupId) {
      this.removeWindowFromGroup(windowId, windowMeta.groupId);
    }

    // Add to new group
    group.tabs.push(windowId);
    windowMeta.groupId = groupId;
  }

  /**
   * Remove a window from its tab group (and destroy group if empty).
   */
  removeWindowFromGroup(windowId: string, groupId: string) {
    const group = this.windowGroups.get(groupId);
    const windowMeta = this.openWindows.get(windowId);
    if (!group || !windowMeta) return;

    // Remove from tab array
    group.tabs = group.tabs.filter((id) => id !== windowId);
    windowMeta.groupId = undefined;

    // If group is now empty, delete it
    if (group.tabs.length === 0) {
      this.windowGroups.delete(groupId);
    } else if (group.activeTabIndex >= group.tabs.length) {
      // Clamp active tab index
      group.activeTabIndex = group.tabs.length - 1;
    }
  }

  /**
   * Set the active tab in a window group.
   */
  setActiveTab(groupId: string, tabIndex: number) {
    const group = this.windowGroups.get(groupId);
    if (group && tabIndex >= 0 && tabIndex < group.tabs.length) {
      group.activeTabIndex = tabIndex;
    }
  }

  // ============================================================================
  // Reset
  // ============================================================================

  reset() {
    this.activeToolDrawer = null;
    this.rightSidebarCollapsed = false;
    this.openWindows.clear();
    this.windowGroups.clear();
  }
}

/**
 * Singleton UI state instance.
 */
export const uiState = new UIState();

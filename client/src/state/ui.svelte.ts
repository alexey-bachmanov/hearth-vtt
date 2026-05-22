/**
 * UI state management using Svelte 5 runes.
 *
 * This module holds the reactive state for the player UI,
 * including drawer/sidebar visibility, active tool drawers,
 * tabbed floating windows, and seat permissions.
 */

import { connectionState } from './connection.svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { SeatRole } from './types';

// ============================================================================
// Window sizing constants
// These mirror the CSS tokens in tokens.css. Update both together.
// ============================================================================

/** Minimum allowed width (px). Matches --window-min-width token. */
export const WINDOW_MIN_WIDTH = 320;

/** Minimum allowed height (px). Matches --window-min-height token. */
export const WINDOW_MIN_HEIGHT = 240;

/** Default width (px) for newly opened windows. Matches --window-default-width token. */
export const WINDOW_DEFAULT_WIDTH = 480;

/** Default height (px) for newly opened windows. Matches --window-default-height token. */
export const WINDOW_DEFAULT_HEIGHT = 400;

/**
 * Cascade offset applied per open group when no explicit position is given.
 * Each additional group is staggered by this many pixels on both axes.
 */
const WINDOW_STAGGER_OFFSET = 24;

/**
 * Top-left anchor for the first window when no explicit position is given.
 * Chosen to place the window comfortably inside most viewport sizes.
 */
const WINDOW_BASE_X = 200;
const WINDOW_BASE_Y = 100;

// ============================================================================
// Types
// ============================================================================

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
 * Exhaustive list of floating window content types.
 *
 * To register a new window type:
 *   1. Add its ID here.
 *   2. Create the content component in `ui/window/`.
 *   3. Add it to the WINDOW_CONTENT registry in TabbedWindow.svelte.
 */
export type WindowId =
  | 'actor-sheet'
  | 'token-config'
  | 'scene-config'
  | 'campaign-prep'
  | 'settings';

/**
 * Metadata for a single floating window tab.
 *
 * Position and size are intentionally absent — they live on WindowGroup so
 * that all tabs in a group share a single draggable frame. The `context`
 * bag carries any type-specific data the content component needs (e.g.
 * `{ actorId: 'abc' }` for an actor sheet). It must be fully serializable
 * so it can later be encoded as URL params for browser pop-out support.
 *
 * `poppedOut` is reserved for future browser pop-out support.
 */
export interface WindowMeta {
  /** Unique instance ID (e.g. "actor-sheet-7"). */
  id: string;
  /** Determines which content component is rendered. */
  type: WindowId;
  /** Displayed in the tab label and window title bar. */
  title: string;
  /** Serializable data passed as props to the content component. */
  context?: Record<string, unknown>;
  /** Reserved: true when this window has been popped out to its own browser window. */
  poppedOut?: boolean;
}

/**
 * A draggable container that holds one or more window tabs.
 *
 * All position, size, and z-index state lives here. A single-tab group
 * renders identically to the old standalone FloatingWindow (tab bar hidden).
 * A multi-tab group shows a tab strip above the content area.
 *
 * `poppedOut` is reserved for future browser pop-out support.
 */
export interface WindowGroup {
  /** Unique group ID (e.g. "group-3"). */
  id: string;
  /** Left edge position in viewport pixels. */
  x: number;
  /** Top edge position in viewport pixels. */
  y: number;
  /** Width in viewport pixels (clamped to WINDOW_MIN_WIDTH). */
  width: number;
  /** Height in viewport pixels (clamped to WINDOW_MIN_HEIGHT). */
  height: number;
  /** Stacking order; higher value renders on top. */
  zIndex: number;
  /** ID of the currently visible tab. */
  activeTabId: string;
  /** Ordered list of window IDs in this group. */
  tabs: string[];
  /** Reserved: true when this group has been popped out to its own browser window. */
  poppedOut?: boolean;
}

/**
 * Parameters for opening a new floating window via `uiState.openWindow()`.
 */
export interface OpenWindowParams {
  type: WindowId;
  title: string;
  context?: Record<string, unknown>;
  /** If omitted, position is auto-staggered based on the number of open groups. */
  position?: { x: number; y: number };
  /** If omitted, defaults to WINDOW_DEFAULT_WIDTH × WINDOW_DEFAULT_HEIGHT. */
  size?: { width: number; height: number };
}

/**
 * The subject of a right-click context menu on the canvas.
 *
 * - `kind: 'token'` — the cursor was over a token when the menu was opened.
 * - `kind: 'canvas'` — the cursor was over empty canvas space.
 *
 * `screenX`/`screenY` are viewport-relative coordinates used to position the
 * floating menu element.
 */
export type ContextMenuTarget =
  | { kind: 'token'; tokenId: string; screenX: number; screenY: number }
  | { kind: 'canvas'; screenX: number; screenY: number };

// ============================================================================
// UIState class
// ============================================================================

/**
 * UIState holds the reactive state for the player UI.
 *
 * Responsibilities:
 * - Drawer / sidebar visibility
 * - Floating window lifecycle (open, close, merge, detach, z-order)
 * - Derived seat permissions
 *
 * Window architecture:
 * - Every window always lives inside a WindowGroup (a 1-tab group is the
 *   "standalone" case). Rendering iterates `windowGroups`; `openWindows`
 *   is a lookup map for tab metadata (title, type, context).
 * - `windowGroupMap` is a private reverse-lookup (windowId → groupId) that
 *   avoids O(n) scans when closing or moving tabs.
 */
class UIState {
  // Left toolbar drawer (null = none open)
  activeToolDrawer = $state<ToolDrawerId | null>(null);

  // Right sidebar visibility
  rightSidebarOpen = $state<boolean>(true);

  /**
   * All open window tabs, keyed by window ID.
   * Used to look up metadata (title, type, context) when rendering tab labels.
   */
  openWindows = $state<SvelteMap<string, WindowMeta>>(new SvelteMap());

  /**
   * All window groups (draggable frames), keyed by group ID.
   * This is the primary collection iterated by FloatingWindowLayer.
   */
  windowGroups = $state<SvelteMap<string, WindowGroup>>(new SvelteMap());

  /**
   * The group ID currently highlighted as a drag-to-combine drop target.
   * Set by the dragging TabbedWindow on mousemove; cleared on mouseup or Escape.
   * Null when no drag is in progress or cursor is not over a valid target.
   */
  dropTargetGroupId = $state<string | null>(null);

  /**
   * Coordinates a seamless drag handoff when a tab is detached via drag.
   * Written by the detaching TabbedWindow immediately after calling detachTab;
   * consumed (set back to null) by the new TabbedWindow's mount effect so it
   * picks up the drag gesture without requiring the user to re-click.
   */
  pendingDragCapture = $state<{
    groupId: string;
    anchorX: number;
    anchorY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  /**
   * The active canvas context-menu target, or null when the menu is closed.
   * Set by CanvasInputController on right-click; cleared by ContextMenu.svelte
   * on outside-click or Escape.
   */
  contextMenu = $state<ContextMenuTarget | null>(null);

  // Private reverse-lookup: windowId → groupId.
  // Maintained in sync with windowGroups to avoid O(n*m) scans.
  private windowGroupMap = new Map<string, string>();

  // Monotonic counter for stable, unique IDs (avoids Date.now() collisions).
  private nextSeq = 0;

  // Seat role (read directly from connection state)
  get seatRole(): SeatRole {
    return connectionState.seatRole;
  }

  // GM tool visibility gate (convenience wrapper for LeftToolbar)
  get canAccessGMTools(): boolean {
    return connectionState.seatRole === 'gm';
  }

  // ============================================================================
  // Context Menu Methods
  // ============================================================================

  /** Open the canvas context menu at the given target. */
  openContextMenu(target: ContextMenuTarget) {
    this.contextMenu = target;
  }

  /** Close the canvas context menu. */
  closeContextMenu() {
    this.contextMenu = null;
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

  /**
   * Toggle the right chat sidebar open or closed.
   */
  toggleRightSidebar() {
    this.rightSidebarOpen = !this.rightSidebarOpen;
  }

  // ============================================================================
  // Window Management Methods
  // ============================================================================

  /**
   * Open a new floating window in its own single-tab group.
   *
   * If no position is provided the window is staggered relative to the
   * current number of open groups so windows don't stack exactly on top
   * of each other.
   *
   * @returns The generated window ID (useful for immediately focusing the tab).
   */
  openWindow(params: OpenWindowParams): string {
    const windowId = `${params.type}-${++this.nextSeq}`;
    const groupId = `group-${++this.nextSeq}`;

    // Stagger position based on how many groups are already open.
    const stagger = this.windowGroups.size * WINDOW_STAGGER_OFFSET;
    const x = params.position?.x ?? WINDOW_BASE_X + stagger;
    const y = params.position?.y ?? WINDOW_BASE_Y + stagger;
    const width = params.size?.width ?? WINDOW_DEFAULT_WIDTH;
    const height = params.size?.height ?? WINDOW_DEFAULT_HEIGHT;

    const windowMeta: WindowMeta = {
      id: windowId,
      type: params.type,
      title: params.title,
      context: params.context,
      poppedOut: false,
    };

    const group: WindowGroup = {
      id: groupId,
      x,
      y,
      width,
      height,
      zIndex: this.getMaxZIndex() + 1,
      activeTabId: windowId,
      tabs: [windowId],
      poppedOut: false,
    };

    this.openWindows.set(windowId, windowMeta);
    this.windowGroups.set(groupId, group);
    this.windowGroupMap.set(windowId, groupId);

    return windowId;
  }

  /**
   * Close a single window tab.
   *
   * If the tab is the last one in its group the group is also destroyed.
   * If the tab was active, the adjacent tab becomes active.
   */
  closeTab(windowId: string) {
    const groupId = this.windowGroupMap.get(windowId);
    if (groupId) {
      const group = this.windowGroups.get(groupId)!;
      const tabIndex = group.tabs.indexOf(windowId);

      group.tabs = group.tabs.filter((id) => id !== windowId);
      this.windowGroupMap.delete(windowId);

      if (group.tabs.length === 0) {
        // Last tab — destroy the group entirely.
        this.windowGroups.delete(groupId);
      } else if (group.activeTabId === windowId) {
        // Active tab was closed — switch to the nearest remaining tab.
        const newIndex = Math.min(tabIndex, group.tabs.length - 1);
        group.activeTabId = group.tabs[newIndex];
      }
    }

    this.openWindows.delete(windowId);
  }

  /**
   * Bring a group to the front of the z-order.
   *
   * @param groupId - The group to raise.
   */
  bringGroupToFront(groupId: string) {
    const group = this.windowGroups.get(groupId);
    if (!group) return;
    this.windowGroups.set(groupId, {
      ...group,
      zIndex: this.getMaxZIndex() + 1,
    });
  }

  /**
   * Update the position of a window group (called during drag).
   *
   * @param groupId - The group to reposition.
   * @param x - New left edge in viewport pixels.
   * @param y - New top edge in viewport pixels.
   */
  updateGroupPosition(groupId: string, x: number, y: number) {
    const group = this.windowGroups.get(groupId);
    if (!group) return;
    group.x = x;
    group.y = y;
  }

  /**
   * Update the size of a window group, optionally also updating position.
   *
   * Position params are used when resizing from the top or left edge, where
   * the opposite edge must stay anchored (x/y shift to compensate).
   * Min dimensions are enforced; position is adjusted to match when clamped.
   *
   * @param groupId - The group to resize.
   * @param width - New width in viewport pixels.
   * @param height - New height in viewport pixels.
   * @param x - New left edge in viewport pixels (omit to keep current).
   * @param y - New top edge in viewport pixels (omit to keep current).
   */
  updateGroupSize(
    groupId: string,
    width: number,
    height: number,
    x?: number,
    y?: number,
  ) {
    const group = this.windowGroups.get(groupId);
    if (!group) return;
    // Spread to new object so the changed reference propagates through
    // $derived dependency chains (same reference = no propagation).
    this.windowGroups.set(groupId, {
      ...group,
      width: Math.max(width, WINDOW_MIN_WIDTH),
      height: Math.max(height, WINDOW_MIN_HEIGHT),
      x: x ?? group.x,
      y: y ?? group.y,
    });
  }

  // ============================================================================
  // Window Tab Group Methods
  // ============================================================================

  /**
   * Set the active (visible) tab within a group.
   *
   * @param groupId - The group containing the tab.
   * @param windowId - The window ID to make active.
   */
  setActiveTab(groupId: string, windowId: string) {
    const group = this.windowGroups.get(groupId);
    if (group && group.tabs.includes(windowId)) {
      // Spread to new object so the changed reference propagates through
      // $derived dependency chains (same reference = no propagation).
      this.windowGroups.set(groupId, { ...group, activeTabId: windowId });
    }
  }

  /**
   * Merge all tabs from one group into another.
   *
   * The source group is destroyed. The target group's active tab is unchanged.
   * The merged tabs are appended after the target's existing tabs.
   *
   * @param sourceGroupId - Group whose tabs will be moved.
   * @param targetGroupId - Group that receives the tabs.
   */
  mergeGroups(sourceGroupId: string, targetGroupId: string) {
    if (sourceGroupId === targetGroupId) return;

    const source = this.windowGroups.get(sourceGroupId);
    const target = this.windowGroups.get(targetGroupId);
    if (!source || !target) return;

    // Build new tabs array — avoids relying on .push() being tracked.
    target.tabs = [...target.tabs, ...source.tabs];
    for (const windowId of source.tabs) {
      this.windowGroupMap.set(windowId, targetGroupId);
    }

    this.windowGroups.delete(sourceGroupId);
    // Spread to new object so the changed reference propagates through
    // $derived dependency chains (same reference = no propagation).
    this.windowGroups.set(targetGroupId, { ...target });
  }

  /**
   * Detach a single tab from its current group and open it as a new group.
   *
   * If the source group becomes empty after detachment it is destroyed.
   * The new group inherits the source group's dimensions.
   *
   * @param windowId - The tab to detach.
   * @param x - Left edge of the new group in viewport pixels.
   * @param y - Top edge of the new group in viewport pixels.
   */
  detachTab(windowId: string, x: number, y: number): string | null {
    const sourceGroupId = this.windowGroupMap.get(windowId);
    if (!sourceGroupId) return null;

    const sourceGroup = this.windowGroups.get(sourceGroupId)!;
    const tabIndex = sourceGroup.tabs.indexOf(windowId);

    // Remove from source group.
    sourceGroup.tabs = sourceGroup.tabs.filter((id) => id !== windowId);
    if (sourceGroup.tabs.length === 0) {
      this.windowGroups.delete(sourceGroupId);
    } else {
      const updatedSource = { ...sourceGroup };
      if (updatedSource.activeTabId === windowId) {
        const newIndex = Math.min(tabIndex, updatedSource.tabs.length - 1);
        updatedSource.activeTabId = updatedSource.tabs[newIndex];
      }
      // Spread to new object so the changed reference propagates through
      // $derived dependency chains (same reference = no propagation).
      this.windowGroups.set(sourceGroupId, updatedSource);
    }

    // Create a new single-tab group at the requested position.
    const newGroupId = `group-${++this.nextSeq}`;

    this.windowGroups.set(newGroupId, {
      id: newGroupId,
      x,
      y,
      width: sourceGroup.width,
      height: sourceGroup.height,
      zIndex: this.getMaxZIndex() + 1,
      activeTabId: windowId,
      tabs: [windowId],
      poppedOut: false,
    });

    this.windowGroupMap.set(windowId, newGroupId);
    return newGroupId;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Returns the highest zIndex currently in use across all groups, or 0 if
   * no groups are open. Used to place newly opened or raised groups on top.
   */
  private getMaxZIndex(): number {
    const values = Array.from(this.windowGroups.values()).map((g) => g.zIndex);
    return values.length > 0 ? Math.max(...values) : 0;
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /**
   * Reset all UI state to defaults (e.g. on disconnect or campaign change).
   */
  reset() {
    this.activeToolDrawer = null;
    this.rightSidebarOpen = true;
    this.openWindows.clear();
    this.windowGroups.clear();
    this.windowGroupMap.clear();
    this.dropTargetGroupId = null;
    this.pendingDragCapture = null;
  }
}

/**
 * Singleton UI state instance.
 */
export const uiState = new UIState();

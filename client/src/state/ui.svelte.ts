/**
 * UI state management using Svelte 5 runes.
 * 
 * This module holds local-only UI state that is not synced with the server.
 * Includes open windows, selected tools, drawer tabs, sidebar collapsed state, etc.
 */

/**
 * UI state store.
 * 
 * Manages client-side UI state for windows, tools, and layout preferences.
 * Not persisted across page reloads (future: use localStorage).
 */
class UIState {
  // Sidebar state
  leftSidebarCollapsed = $state<boolean>(false);
  rightSidebarCollapsed = $state<boolean>(false);

  // Active drawer tab in RightSidebar
  activeDrawerTab = $state<'compendium' | 'journal' | 'settings' | 'jukebox'>('compendium');

  // Selected tool in BottomToolbar
  selectedTool = $state<string | null>(null);

  // Open floating windows (window ID → window state)
  openWindows = $state<Map<string, { type: string; data: unknown; zIndex: number }>>(new Map());
  nextZIndex = $state<number>(100); // Start at z-floating-window

  /**
   * Toggle left sidebar collapsed state.
   */
  toggleLeftSidebar() {
    this.leftSidebarCollapsed = !this.leftSidebarCollapsed;
  }

  /**
   * Toggle right sidebar collapsed state.
   */
  toggleRightSidebar() {
    this.rightSidebarCollapsed = !this.rightSidebarCollapsed;
  }

  /**
   * Set the active drawer tab.
   */
  setActiveDrawerTab(tab: 'compendium' | 'journal' | 'settings' | 'jukebox') {
    this.activeDrawerTab = tab;
  }

  /**
   * Set the selected tool.
   */
  setSelectedTool(tool: string | null) {
    this.selectedTool = tool;
  }

  /**
   * Open a floating window.
   */
  openWindow(id: string, type: string, data: unknown) {
    this.openWindows.set(id, { type, data, zIndex: this.nextZIndex });
    this.nextZIndex += 1;
  }

  /**
   * Close a floating window.
   */
  closeWindow(id: string) {
    this.openWindows.delete(id);
  }

  /**
   * Bring a window to front (update z-index).
   */
  bringWindowToFront(id: string) {
    const window = this.openWindows.get(id);
    if (window) {
      window.zIndex = this.nextZIndex;
      this.nextZIndex += 1;
    }
  }

  /**
   * Close all windows.
   */
  closeAllWindows() {
    this.openWindows.clear();
  }

  /**
   * Reset UI state to defaults.
   */
  reset() {
    this.leftSidebarCollapsed = false;
    this.rightSidebarCollapsed = false;
    this.activeDrawerTab = 'compendium';
    this.selectedTool = null;
    this.openWindows.clear();
    this.nextZIndex = 100;
  }
}

/**
 * Singleton UI state instance.
 */
export const uiState = new UIState();

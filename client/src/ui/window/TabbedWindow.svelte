<script lang="ts">
/**
 * TabbedWindow - Draggable floating window shell with tab support.
 *
 * Architecture:
 * - Reads all group/tab state from uiState by groupId — no prop drilling for
 *   window data.
 * - Position, size, and z-index live on WindowGroup in uiState; dragging is
 *   committed on mouseup so the state store is only updated once per gesture.
 *   During the gesture, local $state variables (localX/localY) drive the
 *   rendered position for smooth dragging without continuous store writes.
 * - Content is dispatched via the WINDOW_CONTENT registry keyed by WindowId.
 *   To register a new window type, see the registry comment below.
 *
 * Single-tab: tab bar is hidden; renders identical to a plain window frame.
 * Multi-tab: tab strip appears in the header. Each tab has its own close ×.
 *   The window closes automatically when the last tab is closed.
 *
 * Context menus:
 * - Right-click the header area: list other groups to merge this one into.
 * - Right-click a tab: "Detach tab" plus merge options.
 *
 * Drag-to-combine:
 * - While dragging the header, the current cursor position is tested against
 *   every other group's bounding box (read from uiState — no DOM queries).
 * - If the cursor lands inside another group's header strip, that group
 *   becomes the drop target: it receives the .tabbed-window--drop-target CSS
 *   modifier via `dropTargetGroupId` published to uiState.dropTargetGroupId.
 * - On mouseup over a target: mergeGroups(thisGroup, target) is called
 *   instead of updateGroupPosition.
 * - Drop-target detection uses the header strip height (--window-tab-height)
 *   because dropping onto the body of another window is intentionally ignored
 *   — users should only merge by dragging one window's header onto another's.
 *
 * Drag-to-detach:
 * - Mousedown on a tab label begins tracking a potential tab drag.
 * - If the cursor moves more than TAB_DETACH_THRESHOLD px before mouseup,
 *   uiState.detachTab() is called, creating a new single-tab group positioned
 *   under the cursor (header centred on the cursor).
 * - To make the detach feel seamless, the new group's drag is handed off via
 *   uiState.pendingDragCapture: a $effect in every TabbedWindow watches for
 *   its groupId in that field and immediately enters drag mode without
 *   requiring the user to release and re-grab the mouse.
 *
 * Pop-out readiness: content components receive only the serializable
 * `context` props from WindowMeta, making them mountable in a standalone
 * /window route in the future. `poppedOut` flag is reserved on WindowGroup.
 *
 * Context key conventions per window type:
 *   'actor-sheet'   → context.characterId (string)
 *   'token-config'  → context.itemId (string)
 *   'scene-config'  → context.documentId (string)
 *   'campaign-prep' → no required context keys
 *   'settings'      → no required context keys
 */

import { uiState, type WindowId } from '../../state/ui.svelte';
import type { Component } from 'svelte';
import CharacterSheet from './CharacterSheet.svelte';
import DocumentReader from './DocumentReader.svelte';
import ItemInspector from './ItemInspector.svelte';
import InitiativeModal from './InitiativeModal.svelte';

// ============================================================================
// Content registry
//
// Maps WindowId → Svelte content component.
// To add a new window type:
//   1. Add its ID to the WindowId union in ui.svelte.ts.
//   2. Create the content component in ui/window/.
//   3. Add the mapping below.
//   4. Document the expected context keys in the JSDoc above.
//
// Components receive WindowMeta.context spread as props, so context keys must
// match the component's declared prop names.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WINDOW_CONTENT: Partial<Record<WindowId, Component<any>>> = {
  'actor-sheet': CharacterSheet,
  'token-config': ItemInspector,
  'scene-config': DocumentReader,
  'campaign-prep': InitiativeModal,
  // 'settings' intentionally omitted until the component is implemented
};

// ============================================================================
// Props
// ============================================================================

interface Props {
  groupId: string;
}

let { groupId }: Props = $props();

// ============================================================================
// Derived state (reactive reads from uiState)
// ============================================================================

let group = $derived(uiState.windowGroups.get(groupId));

let tabs = $derived(
  group?.tabs
    .map((id) => uiState.openWindows.get(id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined) ?? [],
);

let activeTab = $derived(group ? uiState.openWindows.get(group.activeTabId) : undefined);

let contentComponent = $derived(activeTab ? (WINDOW_CONTENT[activeTab.type] ?? null) : null);

let isMultiTab = $derived(tabs.length > 1);

/**
 * Other open groups — used to populate "Merge into …" options in the context
 * menu. Title is taken from the group's currently active tab.
 */
let otherGroups = $derived(
  [...uiState.windowGroups.values()]
    .filter((g) => g.id !== groupId)
    .map((g) => ({
      id: g.id,
      title: uiState.openWindows.get(g.activeTabId)?.title ?? 'Untitled',
    })),
);

// ============================================================================
// Drag state
// ============================================================================
//
// Declared before the $derived expressions below that reference them.

let isDragging = $state(false);
let localX = $state(0);
let localY = $state(0);

// Rendered position: local state during drag, group state otherwise.
let renderX = $derived(isDragging ? localX : (group?.x ?? 0));
let renderY = $derived(isDragging ? localY : (group?.y ?? 0));

// Whether this group is the current drop target of another window's drag.
let isDropTarget = $derived(uiState.dropTargetGroupId === groupId);

// Non-reactive drag anchors (only read on mouseup, no need to re-render).
let dragAnchorX = 0;
let dragAnchorY = 0;
let baseX = 0;
let baseY = 0;

/**
 * The height of the header strip used for drop-target hit testing.
 * Must stay in sync with the --window-tab-height CSS token (32px).
 */
const HEADER_HIT_HEIGHT = 32;

// ============================================================================
// Tab drag-to-detach state
//
// Plain (non-reactive) variables because they don't drive template rendering.
// ============================================================================

/** windowId of the tab being dragged, or null when no tab drag is in progress. */
let tabDragWindowId: string | null = null;
let tabDragStartX = 0;
let tabDragStartY = 0;

/**
 * How many pixels the cursor must move from the mousedown point before
 * the tab is detached into its own window.
 */
const TAB_DETACH_THRESHOLD = 20;

/**
 * Seamless drag handoff: when another TabbedWindow detaches a tab, it writes
 * the new group's ID and drag anchors into uiState.pendingDragCapture. We
 * pick that up here, claim it (set to null) and immediately enter drag mode so
 * the user never has to release and re-grab the mouse.
 */
$effect(() => {
  const capture = uiState.pendingDragCapture;
  if (capture?.groupId === groupId) {
    uiState.pendingDragCapture = null;
    isDragging = true;
    dragAnchorX = capture.anchorX;
    dragAnchorY = capture.anchorY;
    baseX = capture.baseX;
    baseY = capture.baseY;
    localX = baseX;
    localY = baseY;
    uiState.bringGroupToFront(groupId);
  }
});

/**
 * Find the group whose header strip contains the given viewport point,
 * excluding our own group. Returns the group id or null.
 *
 * Hit area is the header strip only (top HEADER_HIT_HEIGHT px of the group),
 * so users must aim for another window's header — not just overlap the body.
 */
function findDropTarget(cursorX: number, cursorY: number): string | null {
  for (const [id, g] of uiState.windowGroups) {
    if (id === groupId) continue;
    const inHeader =
      cursorX >= g.x &&
      cursorX <= g.x + g.width &&
      cursorY >= g.y &&
      cursorY <= g.y + HEADER_HIT_HEIGHT;
    if (inHeader) return id;
  }
  return null;
}

/**
 * Start a drag gesture from the title/tab-bar header area.
 * Skips interactive children (buttons) so tabs and close buttons keep working.
 */
function handleHeaderMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  // Let button clicks pass through without starting a drag.
  if ((event.target as HTMLElement).closest('button')) return;

  event.preventDefault();

  isDragging = true;
  dragAnchorX = event.clientX;
  dragAnchorY = event.clientY;
  baseX = group?.x ?? 0;
  baseY = group?.y ?? 0;
  localX = baseX;
  localY = baseY;

  uiState.bringGroupToFront(groupId);
}

/**
 * Track the start of a potential tab drag-to-detach gesture.
 * The header mousedown guard already skips buttons, but tab buttons call this
 * explicitly via onmousedown so we can track the originating tab.
 */
function handleTabMouseDown(event: MouseEvent, windowId: string) {
  if (event.button !== 0) return;
  tabDragWindowId = windowId;
  tabDragStartX = event.clientX;
  tabDragStartY = event.clientY;
}

function handleWindowMouseMove(event: MouseEvent) {
  // Tab drag: check whether the cursor has exceeded the detach threshold.
  if (tabDragWindowId !== null && !isDragging) {
    const dx = event.clientX - tabDragStartX;
    const dy = event.clientY - tabDragStartY;
    if (Math.hypot(dx, dy) > TAB_DETACH_THRESHOLD) {
      const detachId = tabDragWindowId;
      tabDragWindowId = null;
      // Place the new window so its header is centred under the cursor.
      const newX = event.clientX - (group?.width ?? 480) / 2;
      const newY = event.clientY - HEADER_HIT_HEIGHT / 2;
      const newGroupId = uiState.detachTab(detachId, newX, newY);
      if (newGroupId) {
        // Signal the new TabbedWindow to enter drag mode immediately.
        uiState.pendingDragCapture = {
          groupId: newGroupId,
          anchorX: event.clientX,
          anchorY: event.clientY,
          baseX: newX,
          baseY: newY,
        };
      }
    }
    // Don't also move this window while tracking a tab drag.
    return;
  }

  if (!isDragging) return;
  localX = baseX + (event.clientX - dragAnchorX);
  localY = baseY + (event.clientY - dragAnchorY);

  // Hit-test cursor position against other groups' header strips.
  uiState.dropTargetGroupId = findDropTarget(event.clientX, event.clientY);
}

function handleWindowMouseUp() {
  // Always clear tab drag tracking on mouseup (covers click-without-drag).
  tabDragWindowId = null;

  if (!isDragging) return;
  isDragging = false;

  const target = uiState.dropTargetGroupId;
  uiState.dropTargetGroupId = null;

  if (target) {
    // Drop onto another window header → merge.
    uiState.mergeGroups(groupId, target);
  } else {
    // Normal drop → commit position.
    uiState.updateGroupPosition(groupId, localX, localY);
  }
}

// ============================================================================
// Click-to-front (body area; header already handled in startDrag)
// ============================================================================

function handleWindowMouseDown(event: MouseEvent) {
  // Header drag already calls bringGroupToFront; avoid a redundant call.
  if ((event.target as HTMLElement).closest('.tabbed-window__header')) return;
  uiState.bringGroupToFront(groupId);
}

// ============================================================================
// Tab management
// ============================================================================

function handleTabClick(event: MouseEvent, windowId: string) {
  event.stopPropagation();
  uiState.setActiveTab(groupId, windowId);
}

function handleTabClose(event: MouseEvent, windowId: string) {
  event.stopPropagation();
  uiState.closeTab(windowId);
}

function handleWindowClose() {
  if (activeTab) {
    uiState.closeTab(activeTab.id);
  }
}

// ============================================================================
// Context menu
// ============================================================================

interface ContextMenuState {
  x: number;
  y: number;
  /** Set when right-clicking a specific tab; enables the "Detach tab" option. */
  tabId?: string;
}

let contextMenu = $state<ContextMenuState | null>(null);

function handleHeaderContextMenu(event: MouseEvent) {
  event.preventDefault();
  contextMenu = { x: event.clientX, y: event.clientY };
}

function handleTabContextMenu(event: MouseEvent, tabId: string) {
  event.preventDefault();
  event.stopPropagation();
  contextMenu = { x: event.clientX, y: event.clientY, tabId };
}

function handleMerge(targetGroupId: string) {
  uiState.mergeGroups(groupId, targetGroupId);
  contextMenu = null;
}

function handleDetach(windowId: string) {
  // Offset the new group slightly so it doesn't overlap exactly.
  const x = (group?.x ?? 0) + 30;
  const y = (group?.y ?? 0) + 30;
  uiState.detachTab(windowId, x, y);
  contextMenu = null;
}

// Close context menu when clicking outside it.
function handleGlobalClick(event: MouseEvent) {
  if (contextMenu && !(event.target as HTMLElement).closest('.tabbed-window__context-menu')) {
    contextMenu = null;
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    contextMenu = null;
    tabDragWindowId = null;
    // If we were dragging, cancel it cleanly.
    if (isDragging) {
      isDragging = false;
      uiState.dropTargetGroupId = null;
    }
  }
}
</script>

<svelte:window
  onmousemove={handleWindowMouseMove}
  onmouseup={handleWindowMouseUp}
  onclick={handleGlobalClick}
  onkeydown={handleGlobalKeydown}
/>

{#if group}
  <div
    class="tabbed-window"
    class:tabbed-window--dragging={isDragging}
    class:tabbed-window--drop-target={isDropTarget}
    style="left: {renderX}px; top: {renderY}px; width: {group.width}px; height: {group.height}px; z-index: {group.zIndex};"
    onmousedown={handleWindowMouseDown}
    role="dialog"
    aria-label={activeTab?.title ?? 'Window'}
    tabindex="-1"
  >
    <!-- ================================================================
         Header: tab strip (multi-tab) or title bar (single tab)
         ================================================================ -->
    <div
      class="tabbed-window__header"
      onmousedown={handleHeaderMouseDown}
      oncontextmenu={handleHeaderContextMenu}
      role="presentation"
    >
      {#if isMultiTab}
        <!-- Tab strip -->
        <div class="tabbed-window__tab-bar" role="tablist">
          {#each tabs as tab (tab.id)}
            <button
              class="tabbed-window__tab"
              class:tabbed-window__tab--active={tab.id === group.activeTabId}
              role="tab"
              aria-selected={tab.id === group.activeTabId}
              onmousedown={(e) => handleTabMouseDown(e, tab.id)}
              onclick={(e) => handleTabClick(e, tab.id)}
              oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
            >
              <span class="tabbed-window__tab-label">{tab.title}</span>
              <span
                class="tabbed-window__tab-close"
                role="button"
                tabindex="0"
                aria-label="Close {tab.title}"
                onclick={(e) => handleTabClose(e, tab.id)}
                onkeydown={(e) => e.key === 'Enter' && handleTabClose(e as unknown as MouseEvent, tab.id)}
              >✕</span>
            </button>
          {/each}
        </div>
      {:else}
        <!-- Single-tab title bar -->
        <div class="tabbed-window__title-bar">
          <h4 class="tabbed-window__title">{activeTab?.title ?? ''}</h4>
          <button
            class="tabbed-window__close"
            aria-label="Close window"
            onclick={handleWindowClose}
          >✕</button>
        </div>
      {/if}
    </div>

    <!-- ================================================================
         Content area
         ================================================================ -->
    <div class="tabbed-window__body" role="tabpanel">
      {#if contentComponent}
        {@const Comp = contentComponent}
        <Comp {...(activeTab?.context ?? {})} />
      {:else if activeTab}
        <div class="tabbed-window__empty">
          {activeTab.title} — not yet implemented
        </div>
      {/if}
    </div>
  </div>

  <!-- ================================================================
       Context menu (position: fixed, renders at cursor position)
       ================================================================ -->
  {#if contextMenu}
    <div
      class="tabbed-window__context-menu"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
      role="menu"
    >
      {#if contextMenu.tabId}
        <button
          class="tabbed-window__context-menu-item"
          role="menuitem"
          onclick={() => contextMenu?.tabId && handleDetach(contextMenu.tabId)}
        >
          Detach tab
        </button>
        {#if otherGroups.length > 0}
          <div class="tabbed-window__context-menu-separator" role="separator"></div>
        {/if}
      {/if}

      {#each otherGroups as other (other.id)}
        <button
          class="tabbed-window__context-menu-item"
          role="menuitem"
          onclick={() => handleMerge(other.id)}
        >
          Merge into "{other.title}"
        </button>
      {/each}

      {#if !contextMenu.tabId && otherGroups.length === 0}
        <div class="tabbed-window__context-menu-item tabbed-window__context-menu-item--disabled">
          No other windows to merge into
        </div>
      {/if}
    </div>
  {/if}
{/if}
